<?php
declare(strict_types=1);
require_once __DIR__.'/FileStore.php';

/** Private GitHub JSON records committed atomically through Git's tree/ref APIs. */
class GitHubStore extends FileStore
{
    private FileStore $local;
    private bool $inTransaction=false;
    private array $entries=[];
    private array $records=[];
    private array $pending=[];
    private ?string $commit=null;
    private ?string $tree=null;
    public function __construct(string $runtime, private readonly string $repository, private readonly string $token, private readonly string $branch='main')
    {
        if (!preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#D',$repository) || !preg_match('#^[A-Za-z0-9_.-]+$#D',$branch) || $token==='') throw new StorageFailure('GitHub private storage is not configured.');
        parent::__construct($runtime);
        $this->local=new FileStore($runtime);
    }
    protected function api(string $method,string $path,?array $body=null): array
    {
        $handle=curl_init('https://api.github.com/repos/'.$this->repository.$path);
        curl_setopt_array($handle,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>30,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$this->token,'Accept: application/vnd.github+json','X-GitHub-Api-Version: 2022-11-28','User-Agent: LK-Tech-Store-Private-Storage','Content-Type: application/json']]);
        $caBundle=getenv('LK_CA_BUNDLE');if($caBundle&&is_file($caBundle))curl_setopt($handle,CURLOPT_CAINFO,$caBundle);
        if ($body!==null) curl_setopt($handle,CURLOPT_POSTFIELDS,json_encode($body,JSON_THROW_ON_ERROR));
        $response=curl_exec($handle);$status=curl_getinfo($handle,CURLINFO_HTTP_CODE);$transportError=curl_error($handle);curl_close($handle);
        if ($response===false || $status<200 || $status>=300) throw new StorageFailure('GitHub private storage request failed (HTTP '.(int)$status.'). '.($status===0?$transportError:''));
        try { return json_decode($response,true,512,JSON_THROW_ON_ERROR); }
        catch (JsonException $error) { throw new StorageFailure('GitHub returned an invalid storage response.',0,$error); }
    }
    private function snapshot(): void
    {
        $repo=$this->api('GET','');
        if (($repo['private'] ?? false)!==true) throw new StorageFailure('Account storage must be a private GitHub repository.');
        $ref=$this->api('GET','/git/ref/heads/'.rawurlencode($this->branch));
        $this->commit=$ref['object']['sha'];
        $commit=$this->api('GET','/git/commits/'.$this->commit);$this->tree=$commit['tree']['sha'];
        $tree=$this->api('GET','/git/trees/'.$this->tree.'?recursive=1');
        if ($tree['truncated'] ?? false) throw new StorageFailure('Private GitHub storage has outgrown this adapter. Migrate to a database.');
        $this->entries=[];$this->records=[];$this->pending=[];
        foreach ($tree['tree'] as $entry) if ($entry['type']==='blob') $this->entries[$entry['path']]=$entry['sha'];
    }
    private function recordPath(string $collection,string $id): string
    {
        if (!in_array($collection,['users','stores','carts'],true) || !preg_match('/^[a-z0-9_-]{1,100}$/D',$id)) throw new InvalidArgumentException('Invalid private record identifier.');
        return $collection.'/'.$id.'.json';
    }
    public function read(string $collection,string $id): ?array
    {
        if ($collection==='limits') return $this->local->read($collection,$id);
        $path=$this->recordPath($collection,$id);
        if ($this->commit===null) $this->snapshot();
        if (isset($this->pending[$path])) return $this->pending[$path];
        if (isset($this->records[$path])) return $this->records[$path];
        if (!isset($this->entries[$path])) return null;
        $blob=$this->api('GET','/git/blobs/'.$this->entries[$path]);
        $json=base64_decode(str_replace(["\n","\r"],'',$blob['content'] ?? ''),true);
        try { $value=json_decode($json ?: '',true,512,JSON_THROW_ON_ERROR); }
        catch (JsonException $error) { throw new StorageFailure('A private GitHub record is damaged.',0,$error); }
        if (!is_array($value)) throw new StorageFailure('A private GitHub record has an invalid format.');
        return $this->records[$path]=$value;
    }
    public function all(string $collection): array
    {
        if ($collection==='limits') return $this->local->all($collection);
        if (!in_array($collection,['users','stores','carts'],true)) throw new InvalidArgumentException('Invalid collection.');
        if ($this->commit===null) $this->snapshot();
        $paths=array_unique(array_merge(array_keys($this->entries),array_keys($this->pending)));
        $result=[];
        foreach ($paths as $path) if (preg_match('#^'.preg_quote($collection,'#').'/([a-z0-9_-]+)\.json$#D',$path,$match)) $result[]=$this->read($collection,$match[1]);
        return $result;
    }
    public function write(string $collection,string $id,array $record): void
    {
        if (!$this->inTransaction) throw new LogicException('Writes require a transaction.');
        if ($collection==='limits') { $this->local->write($collection,$id,$record);return; }
        if ($this->commit===null) $this->snapshot();
        $this->pending[$this->recordPath($collection,$id)]=$record;
    }
    public function transaction(callable $operation): mixed
    {
        if ($this->inTransaction) return $operation($this);
        return $this->local->transaction(function () use ($operation) {
            $this->commit=null;$this->tree=null;$this->entries=[];$this->records=[];$this->pending=[];$this->inTransaction=true;
            try {
                $result=$operation($this);
                if ($this->pending) {
                    $nodes=[];
                    foreach ($this->pending as $path=>$record) {
                        $blob=$this->api('POST','/git/blobs',['content'=>base64_encode(json_encode($record,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n"),'encoding'=>'base64']);
                        $nodes[]=['path'=>$path,'mode'=>'100644','type'=>'blob','sha'=>$blob['sha']];
                    }
                    $tree=$this->api('POST','/git/trees',['base_tree'=>$this->tree,'tree'=>$nodes]);
                    $commit=$this->api('POST','/git/commits',['message'=>'Update private store records','tree'=>$tree['sha'],'parents'=>[$this->commit]]);
                    // A non-fast-forward update is rejected instead of overwriting another server's registration.
                    $this->api('PATCH','/git/refs/heads/'.rawurlencode($this->branch),['sha'=>$commit['sha'],'force'=>false]);
                }
                return $result;
            } finally { $this->inTransaction=false;$this->commit=null;$this->tree=null;$this->pending=[];$this->records=[];$this->entries=[]; }
        });
    }
}

<?php
declare(strict_types=1);

final class StorageFailure extends RuntimeException {}

/** Private JSON records with serialized writes and atomic replacement. */
class FileStore
{
    private bool $locked = false;
    public function __construct(public readonly string $root)
    {
        foreach (['', '/users', '/stores', '/carts', '/limits', '/sessions'] as $folder) {
            if (!is_dir($root.$folder) && !mkdir($root.$folder, 0700, true) && !is_dir($root.$folder)) {
                throw new StorageFailure('Private storage is not writable.');
            }
        }
    }
    public function transaction(callable $operation): mixed
    {
        if ($this->locked) return $operation($this);
        $lock = fopen($this->root.'/.lock', 'c+b');
        if (!$lock || !flock($lock, LOCK_EX)) throw new StorageFailure('Storage lock could not be acquired.');
        $this->locked = true;
        try { return $operation($this); }
        finally { $this->locked = false; flock($lock, LOCK_UN); fclose($lock); }
    }
    private function path(string $collection, string $id): string
    {
        if (!in_array($collection, ['users', 'stores', 'carts', 'limits'], true) || !preg_match('/^[a-z0-9_-]{1,100}$/D', $id)) {
            throw new InvalidArgumentException('Invalid record identifier.');
        }
        return $this->root.'/'.$collection.'/'.$id.'.json';
    }
    public function read(string $collection, string $id): ?array
    {
        $path = $this->path($collection, $id);
        if (!is_file($path)) return null;
        $raw = file_get_contents($path);
        if ($raw === false) throw new StorageFailure('A record could not be read.');
        try { $record = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException $error) { throw new StorageFailure('A stored record is damaged; restore it from a backup.', 0, $error); }
        if (!is_array($record)) throw new StorageFailure('A stored record has an invalid format.');
        return $record;
    }
    public function all(string $collection): array
    {
        $records = [];
        foreach (glob($this->root.'/'.$collection.'/*.json') ?: [] as $path) {
            $record = $this->read($collection, basename($path, '.json'));
            if ($record !== null) $records[] = $record;
        }
        return $records;
    }
    public function write(string $collection, string $id, array $record): void
    {
        if (!$this->locked) throw new LogicException('Writes require a transaction.');
        $path = $this->path($collection, $id);
        $json = json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n";
        $temp = tempnam(dirname($path), '.pending-');
        if ($temp === false) throw new StorageFailure('Storage is not writable.');
        try {
            $handle = fopen($temp, 'wb');
            if (!$handle) throw new StorageFailure('A record could not be opened.');
            try {
                $offset = 0;
                while ($offset < strlen($json)) {
                    $written = fwrite($handle, substr($json, $offset));
                    if ($written === false || $written === 0) throw new StorageFailure('A complete record could not be saved.');
                    $offset += $written;
                }
                if (!fflush($handle)) throw new StorageFailure('A record could not be flushed.');
                if (function_exists('fsync') && !fsync($handle)) throw new StorageFailure('A record could not be synchronized.');
            } finally { fclose($handle); }
            @chmod($temp, 0600);
            if (!rename($temp, $path)) throw new StorageFailure('A record could not be replaced.');
        } finally { if (is_file($temp)) unlink($temp); }
    }
}

<?php
// Only tests call this with isolated temporary storage, never the live storage directory.
require_once __DIR__.'/../server/src/Commerce.php';
$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$root=realpath($argv[1]);
$testRoot=realpath(__DIR__.'/../.qa');
if(!$root||!$testRoot||!str_starts_with($root.DIRECTORY_SEPARATOR,$testRoot.DIRECTORY_SEPARATOR))throw new RuntimeException('Test storage must stay inside .qa.');
$service=new Commerce(new FileStore($root));
$account=$service->register($input['role'],$input);
echo json_encode($service->publicUser($account),JSON_THROW_ON_ERROR);

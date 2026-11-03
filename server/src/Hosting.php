<?php
declare(strict_types=1);

/** Canonical origins come from server configuration, never untrusted proxy headers. */
function storeOrigin(string $url): string
{
    $parts = parse_url($url);
    $scheme = strtolower($parts['scheme'] ?? '');
    $host = strtolower($parts['host'] ?? '');
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($parts['user']) || isset($parts['pass'])) {
        throw new RuntimeException('Invalid public website URL.');
    }
    $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);
    return $scheme.'://'.$host.':'.$port;
}

function storePublicUrl(string $portal): string
{
    $configured = getenv($portal === 'seller' ? 'LK_SELLER_URL' : 'LK_CUSTOMER_URL');
    if ($configured) { storeOrigin($configured); return rtrim($configured, '/').'/'; }
    if ($portal === (getenv('LK_PORTAL') ?: 'customer') && getenv('RENDER_EXTERNAL_URL')) {
        $url = getenv('RENDER_EXTERNAL_URL');
        storeOrigin($url);
        return rtrim($url, '/').'/';
    }
    if (getenv('RENDER_EXTERNAL_URL')) return '';
    return 'http://127.0.0.1:'.($portal === 'seller' ? '8081' : '8080').'/';
}

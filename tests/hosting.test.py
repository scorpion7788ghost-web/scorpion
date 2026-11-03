"""Simulate a TLS-terminating host using isolated local storage, never live GitHub data."""
import json, os, socket, subprocess, tempfile, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run():
    (ROOT / '.qa').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hosting-', dir=ROOT / '.qa') as folder:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        public = 'https://shop.example.test'
        env = os.environ.copy()
        env.update(LK_PORTAL='customer', LK_STORAGE_DRIVER='local', LK_STORAGE_DIR=folder,
                   LK_CUSTOMER_URL=public, LK_SELLER_URL='https://seller.example.test/',
                   LK_ALLOWED_HOSTS='shop.example.test', PHP_INI_SCAN_DIR=str(ROOT / '.php/conf.d'))
        with open(Path(folder) / 'server.log', 'wb') as log:
            process = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', str(ROOT / 'server/router.php')],
                                       cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(40):
                    try:
                        with urllib.request.urlopen(base + '/healthz', timeout=.5) as response:
                            assert json.load(response) == {'status': 'ok'}
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.1)
                else:
                    raise RuntimeError('PHP server did not start.')
                assert not (Path(folder) / 'users').exists(), 'Health probes must not touch private storage.'
                bootstrap = urllib.request.Request(base + '/api/bootstrap', headers={'Host': 'shop.example.test'})
                with urllib.request.urlopen(bootstrap) as response:
                    state = json.load(response)
                    cookie = response.headers['Set-Cookie']
                assert '; secure' in cookie.lower() and '; httponly' in cookie.lower()
                assert state['customerUrl'] == public + '/'
                assert state['sellerUrl'] == 'https://seller.example.test/'
                assert state['user'] is None and state['products'] == []
                # Forward a secure browser cookie over the proxy's internal HTTP hop.
                headers = {'Host': 'shop.example.test', 'Content-Type': 'application/json',
                           'Cookie': cookie.split(';', 1)[0], 'X-CSRF-Token': state['csrf']}
                for origin in ['http://shop.example.test', 'https://shop.example.test:444',
                               'https://attacker.example.test', 'null']:
                    request = urllib.request.Request(base + '/api/auth/register', method='POST',
                        headers={**headers, 'Origin': origin}, data=b'{}')
                    try:
                        urllib.request.urlopen(request)
                        raise AssertionError('A foreign origin was accepted.')
                    except urllib.error.HTTPError as error:
                        assert error.code == 403
                request = urllib.request.Request(base + '/api/auth/register', method='POST',
                    headers={**headers, 'Origin': public}, data=json.dumps({
                        'name': 'Isolated Hosting Check', 'username': 'hosting_check',
                        'password': 'HostingTestPassword123!'}).encode())
                with urllib.request.urlopen(request) as response:
                    assert response.status == 201
                    account = json.load(response)['user']
                    assert '; secure' in response.headers['Set-Cookie'].lower()
                assert (Path(folder) / 'users' / (account['id'] + '.json')).is_file()
                for path in ['/server/src/Hosting.php', '/.git/config', '/server/storage/', '/deploy/php.ini']:
                    try:
                        urllib.request.urlopen(base + path)
                        raise AssertionError('A private file was served.')
                    except urllib.error.HTTPError as error:
                        assert error.code == 404
                try:
                    urllib.request.urlopen(base + '/api/bootstrap')
                    raise AssertionError('An unconfigured hostname was accepted.')
                except urllib.error.HTTPError as error:
                    assert error.code == 403
                print('PASS: hosted HTTPS origin, Secure session cookies, proxy registration, wrong-origin rejection, hostname enforcement, private paths, and storage-free health checks.')
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

if __name__ == '__main__':
    run()

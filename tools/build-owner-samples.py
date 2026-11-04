"""Build a self-contained, repeatable Owner catalog import from reviewed photos."""
import base64
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'supabase/sample-products'
catalog = []
for product in json.loads((SOURCE / 'products.json').read_text(encoding='utf-8')):
    photo = (SOURCE / 'photos' / (product['key'] + '.jpg')).read_bytes()
    assert photo.startswith(bytes.fromhex('ffd8ff')) and len(photo) < 300000
    assert len(product['name']) <= 80 and len(product['summary']) <= 100
    price_cents = round(product['price'] * 100)
    catalog.append({
        'id': 'product_' + uuid.uuid5(uuid.NAMESPACE_URL, 'lk-owner-tech-v1/' + product['key']).hex,
        'name': product['name'], 'summary': product['summary'],
        'description': product['description'] + '\n\nPhoto: ' + product['photographer'] + ' / Unsplash.',
        'category': 'Tech', 'price': price_cents / 100, 'priceCents': price_cents,
        'stock': 10, 'status': 'active', 'sku': 'OWNER-SAMPLE-' + product['key'].upper(),
        'image': 'data:image/jpeg;base64,' + base64.b64encode(photo).decode('ascii'),
        'color': product['color'], 'isNew': True, 'isCustom': True,
        'isSample': True, 'sampleCollection': 'owner-tech-v1',
        'imageCredit': product['photographer'], 'imageSource': product['source'],
    })
template = (SOURCE / 'import.template.sql').read_text(encoding='utf-8')
payload = json.dumps(catalog, ensure_ascii=True, separators=(',', ':'))
assert '$catalog$' not in payload
result = template.replace('__CATALOG_JSON__', payload)
(ROOT / 'supabase/owner-sample-products.sql').write_text(result, encoding='utf-8', newline='\n')
print(f'Prepared {len(catalog)} Owner products with embedded JPEG photos.')

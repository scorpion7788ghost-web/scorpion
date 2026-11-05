"""Build a self-contained, repeatable Owner catalog import from reviewed photos."""
import base64
import json
from pathlib import Path
import uuid
import argparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--additional', action='store_true', help='Build the additional Owner catalog without altering permissions.')
additional = parser.parse_args().additional

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'supabase/sample-products'
catalog = []
collection = 'owner-tech-v2' if additional else 'owner-tech-v1'
for product in json.loads((SOURCE / ('additional-products.json' if additional else 'products.json')).read_text(encoding='utf-8')):
    photo = (SOURCE / 'photos' / (product['key'] + '.jpg')).read_bytes()
    assert photo.startswith(bytes.fromhex('ffd8ff')) and len(photo) < 300000
    assert len(product['name']) <= 80 and len(product['summary']) <= 100
    price_cents = round(product['price'] * 100)
    catalog.append({
        'id': 'product_' + uuid.uuid5(uuid.NAMESPACE_URL, 'lk-' + collection + '/' + product['key']).hex,
        'name': product['name'], 'summary': product['summary'],
        'description': product['description'] + '\n\nPhoto: ' + product['photographer'] + ' / Unsplash.',
        'category': product.get('category', 'Tech'), 'price': price_cents / 100, 'priceCents': price_cents,
        'stock': product.get('stock', 10), 'status': 'active', 'sku': 'OWNER-SAMPLE-' + product['key'].upper(),
        'image': 'data:image/jpeg;base64,' + base64.b64encode(photo).decode('ascii'),
        'color': product['color'], 'isNew': True, 'isCustom': True,
        'isSample': True, 'sampleCollection': collection,
        'imageCredit': product['photographer'], 'imageSource': product['source'],
    })
template = (SOURCE / 'import.template.sql').read_text(encoding='utf-8')
if additional:
    template = '-- Additional Owner sample products. Run this COMPLETE file in Supabase SQL Editor.\n-- Preserves existing products, store settings, Owner identity and all access policies.\nbegin;\n\n' + template[template.index('do $import$'):]
    template = template.replace("'owner-tech-v1'", "'owner-tech-v2'")
payload = json.dumps(catalog, ensure_ascii=True, separators=(',', ':'))
assert '$catalog$' not in payload
result = template.replace('__CATALOG_JSON__', payload)
(ROOT / ('supabase/owner-more-products.sql' if additional else 'supabase/owner-sample-products.sql')).write_text(result, encoding='utf-8', newline='\n')
print(f'Prepared {len(catalog)} Owner products with embedded JPEG photos.')

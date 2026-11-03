"""Apply a seller's exported demo catalog to both hardcoded seed files."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'window.DEMO_SEED='

def read_seed(path):
    text = path.read_text(encoding='utf-8-sig')
    return json.loads(text.split(PREFIX, 1)[1].strip().removesuffix(';'))

def merge_export(seed, exported):
    if exported.get('format') != 'lk-tech-seller-export-v1':
        raise ValueError('Choose a Seller Site catalog export.')
    seller = exported.get('seller', {})
    seller_id = seller.get('id', '')
    if not re.fullmatch(r'(nova-tech|orbit-supply|seller-[a-zA-Z0-9-]+)', seller_id):
        raise ValueError('Invalid seller ID.')
    if not isinstance(seller.get('name'), str) or not seller['name'].strip():
        raise ValueError('Store name is required.')
    profile = {'id': seller_id}
    for field, limit in [('name', 120), ('tagline', 140), ('description', 2000), ('email', 120), ('phone', 120), ('location', 120)]:
        profile[field] = str(seller.get(field, ''))[:limit]
    profile['color'] = '#c5a6f5'
    values = exported.get('products')
    if not isinstance(values, list) or len(values) > 40:
        raise ValueError('An export must contain at most 40 products.')
    products = []
    used = set()
    for value in values:
        if value.get('sellerId') != seller_id:
            raise ValueError('Every product must belong to the exported seller.')
        product_id = value.get('id', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,100}', product_id) or product_id in used:
            raise ValueError('Invalid or duplicate product ID.')
        used.add(product_id)
        if any(p['id'] == product_id and p['sellerId'] != seller_id for p in seed['products']):
            raise ValueError('A product ID belongs to another seller.')
        if value.get('status') not in ['active', 'draft', 'archived'] or value.get('category') not in ['Tech', 'Home', 'Accessories', 'Lifestyle']:
            raise ValueError('Invalid status or category.')
        price = value.get('price')
        stock = value.get('stock')
        if isinstance(price, bool) or not isinstance(price, (int, float)) or not 0.01 <= price <= 999999.99:
            raise ValueError('Invalid price.')
        if type(stock) is not int or not 0 <= stock <= 99999:
            raise ValueError('Invalid stock.')
        product = {k: value[k] for k in ['id', 'sellerId', 'category', 'status', 'price', 'stock']}
        for field, limit in [('name', 80), ('summary', 100), ('description', 2000), ('sku', 40)]:
            text = value.get(field, '')
            if not isinstance(text, str) or len(text) > limit or (field != 'sku' and not text.strip()):
                raise ValueError('Invalid product text.')
            product[field] = text
        image = value.get('image', '')
        local_image = isinstance(image, str) and re.fullmatch(r'assets/products/[a-z0-9-]+\.svg', image)
        data_image = isinstance(image, str) and len(image) <= 900000 and re.fullmatch(r'data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+', image)
        if not (local_image or data_image):
            raise ValueError('Invalid product image.')
        if local_image and not (ROOT / image).is_file():
            raise ValueError('A local image is missing.')
        product['image'] = image
        product['color'] = value.get('color') if re.fullmatch(r'#[a-fA-F0-9]{6}', str(value.get('color', ''))) else '#e7dbed'
        product['isNew'] = value.get('isNew') is True
        product['isCustom'] = True
        products.append(product)
    result = dict(seed)
    result['sellers'] = [s for s in seed['sellers'] if s['id'] != seller_id] + [profile]
    result['products'] = [p for p in seed['products'] if p['sellerId'] != seller_id] + products
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path)
    parser.add_argument('--apply', action='store_true', help='Write the validated catalog; otherwise validate only.')
    args = parser.parse_args()
    merged = merge_export(read_seed(ROOT / 'assets/demo-data.js'), json.loads(args.export.read_text(encoding='utf-8-sig')))
    if args.apply:
        text = '/* Hardcoded demonstration data. Not a production account database. */\n' + PREFIX + json.dumps(merged, indent=2, ensure_ascii=True) + ';\n'
        for target in [ROOT / 'assets/demo-data.js', ROOT / 'seller-site/assets/demo-data.js']:
            target.write_text(text, encoding='utf-8')
        print('Updated both demo catalogs. Commit and deploy to make the snapshot available to other visitors.')
    else:
        print('Valid seller export. Other sellers and all account records remain unchanged. Use --apply to write.')

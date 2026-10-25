import assert from 'node:assert/strict';
import test from 'node:test';
import { isShopItemNew, SHOP_NEW_ITEM_DURATION_MS, sortShopItemsByAddedAt } from '../src/lib/shopStorage';
import type { ShopItem } from '../src/types';

const now = Date.parse('2026-10-25T12:00:00.000Z');

function shopItem(id: string, addedAt?: string): ShopItem {
  return {
    id,
    name: id,
    category: 'skin',
    description: '',
    currency: 'ryos',
    price: 0,
    addedAt,
  };
}

test('shop new badge is visible only during the first five days after item creation', () => {
  assert.equal(isShopItemNew({ addedAt: new Date(now - SHOP_NEW_ITEM_DURATION_MS + 1).toISOString() }, now), true);
  assert.equal(isShopItemNew({ addedAt: new Date(now - SHOP_NEW_ITEM_DURATION_MS).toISOString() }, now), false);
  assert.equal(isShopItemNew({ addedAt: new Date(now + 1).toISOString() }, now), false);
  assert.equal(isShopItemNew({}, now), false);
  assert.equal(isShopItemNew({ addedAt: 'invalid-date' }, now), false);
});

test('shop items sort newest-first by added date and retain order when dates are unavailable', () => {
  const items = [
    shopItem('undated-first'),
    shopItem('older', '2026-10-20T12:00:00.000Z'),
    shopItem('undated-second'),
    shopItem('newer', '2026-10-24T12:00:00.000Z'),
  ];

  assert.deepEqual(
    sortShopItemsByAddedAt(items).map(item => item.id),
    ['newer', 'older', 'undated-first', 'undated-second'],
  );
});

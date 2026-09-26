function getConfig() {
  const BASE_URL = process.env.WC_URL;
  const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
  const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;
  const WP_USER = process.env.WORDPRESS_USER;
  const WP_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

  if (!BASE_URL || !CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error('Missing WooCommerce environment variables. Check .env.local file.');
  }

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  return { BASE_URL, WP_USER, WP_APP_PASSWORD, auth };
}

async function request(endpoint, options = {}) {
  const { BASE_URL, auth } = getConfig();
  const url = `${BASE_URL}/wp-json/wc/v3/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WooCommerce API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function getProducts(ids = []) {
  const params = new URLSearchParams();
  if (ids.length) {
    params.append('include', ids.join(','));
  }
  params.append('per_page', 50);
  params.append('_fields', 'id,sku,name,slug,meta_data,description,short_description,images,categories');
  const response = await request(`products?${params.toString()}`);
  return response;
}

/**
 * Получить ВСЕ товары каталога постранично.
 * @param {Object} options
 * @param {number} options.perPage  — товаров на странице (макс 100)
 * @param {function} options.onPage — callback(pageProducts, pageNumber) — вызывается после каждой страницы
 * @param {number} options.delayMs  — задержка между страницами (защита от rate-limit)
 * @returns {Array} все товары
 */
export async function getAllProducts(options = {}) {
  const { perPage = 100, onPage } = options;
  const delayMs = options.delayMs ?? parseInt(process.env.WC_SYNC_DELAY_MS || '500');
  let allProducts = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams();
    params.append('per_page', perPage);
    params.append('page', page);
    params.append('_fields', 'id,sku,name,slug,meta_data,description,short_description,images,categories');
    const products = await requestWithRetry(`products?${params.toString()}`);
    if (!products.length) break;

    allProducts = allProducts.concat(products);
    if (onPage) await onPage(products, page);

    if (products.length < perPage) break; // последняя страница
    page++;

    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return allProducts;
}

/**
 * request() с автоматическим retry при 429 (Too Many Requests).
 */
async function requestWithRetry(endpoint, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await request(endpoint, options);
    } catch (err) {
      lastError = err;
      const is429 = err.message.includes('(429)');
      if (!is429 || attempt === maxRetries) throw err;

      const backoffMs = 1000 * Math.pow(2, attempt);
      console.warn(`Rate limited (429). Retrying in ${backoffMs}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

export async function updateProduct(id, data) {
  return request(`products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getCategories(search = '') {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  params.append('per_page', 100);
  return request(`products/categories?${params.toString()}`);
}

export async function getAllCategories() {
  let allCategories = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const params = new URLSearchParams();
    params.append('per_page', perPage);
    params.append('page', page);
    const categories = await request(`products/categories?${params.toString()}`);
    if (!categories.length) break;
    allCategories = allCategories.concat(categories);
    page++;
  }
  return allCategories;
}

export async function getProductsByCategory(categoryId, limit = 50) {
  const params = new URLSearchParams();
  params.append('category', categoryId);
  params.append('per_page', limit);
  params.append('_fields', 'id,sku,name,slug,meta_data,description,short_description,images,categories');
  return request(`products?${params.toString()}`);
}

// --- Slug update via WordPress REST API ---
export async function updateProductSlug(productId, newSlug) {
  const { BASE_URL, WP_USER, WP_APP_PASSWORD } = getConfig();
  if (!WP_USER || !WP_APP_PASSWORD) {
    throw new Error('WORDPRESS_USER and WORDPRESS_APP_PASSWORD must be set in .env');
  }
  const url = `${BASE_URL}/wp-json/wp/v2/product/${productId}`;
  const wpAuth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${wpAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ slug: newSlug }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WordPress API error (${response.status}): ${errorText}`);
  }
  return response.json();
}
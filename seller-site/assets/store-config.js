/* Public browser settings only. Never put a secret/service_role key here. */
window.STORE_CONFIG = {
  provider: ['localhost', '127.0.0.1'].includes(location.hostname) ? 'php' : 'supabase',
  supabaseUrl: '',
  supabaseKey: '',
  customerUrl: 'https://scorpion7788ghost-web.github.io/scorpion/',
  sellerUrl: 'https://scorpion7788ghost-web.github.io/seller-site/'
};

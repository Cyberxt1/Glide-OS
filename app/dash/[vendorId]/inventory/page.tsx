import { requireStoreContext } from '@/lib/store/context'
import { formatNaira } from '@/lib/store/format'
import { createClient } from '@/lib/supabase/server'
import { bulkCreateProducts, createProduct, setStock } from './actions'

const bulkErrors: Record<string, string> = {
  access: 'Administrator access is required.',
  location: 'Create a store location before importing stock.',
  format: 'Glide could not find the required product name and price columns, or the import is over 300 rows.',
  'duplicate-file': 'The uploaded file repeats a product name, barcode, or SKU. Remove duplicates before importing.',
  'duplicate-store': 'At least one product name, barcode, or SKU already exists in this store.',
  database: 'Glide could not check existing products.',
  products: 'The product batch could not be created. Check duplicate names, SKUs, and price values.',
  inventory: 'The stock batch failed, so the new products were rolled back.',
}

const mappingFields = [
  { name: 'map_name', label: 'Product name', placeholder: 'Item Name' },
  { name: 'map_price', label: 'Price', placeholder: 'Selling Price' },
  { name: 'map_barcode', label: 'Barcode', placeholder: 'EAN / UPC / Code' },
  { name: 'map_quantity', label: 'Quantity', placeholder: 'Qty / Stock' },
  { name: 'map_category', label: 'Category', placeholder: 'Department' },
  { name: 'map_sku', label: 'SKU', placeholder: 'SKU' },
  { name: 'map_low_stock_threshold', label: 'Low stock', placeholder: 'Reorder Level' },
]

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>
  searchParams: Promise<{ imported?: string; bulkError?: string }>
}) {
  const { vendorId } = await params
  const query = await searchParams
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, barcode, category, price_kobo, is_available, location_inventory(quantity, low_stock_threshold)')
    .eq('merchant_id', store.id)
    .order('name')

  return (
    <div className="dash-page">
      <header className="page-head compact">
        <div>
          <p className="dash-kicker">Stock control</p>
          <h1>Inventory</h1>
          <p>One barcode identifies a product; quantity tracks every physical unit.</p>
        </div>

        <div className="head-actions">
          <details className="action-drawer bulk-drawer">
            <summary className="page-action">Bulk add <span>Upload</span></summary>
            <form action={bulkCreateProducts.bind(null, vendorId)}>
              <strong>Bulk product import</strong>
              <p className="drawer-note">
                Upload any vendor CSV. Glide auto-detects common headers, and you can override the
                column names below when a supplier uses unusual labels.
              </p>
              <a className="template-link" href="/glide-products-template.csv" download>
                Download CSV template <span>Down</span>
              </a>

              <label>
                <span>CSV file</span>
                <input name="file" type="file" accept=".csv,text/csv" />
              </label>

              <div className="drawer-divider"><span>or paste CSV</span></div>

              <label>
                <span>Product rows</span>
                <textarea
                  name="csv"
                  rows={8}
                  placeholder={'name,barcode,price,quantity,category,sku,low_stock_threshold\nMalt 65cl,615000000001,900,24,Drinks,MALT-65,6'}
                />
              </label>

              <details className="column-mapper">
                <summary>Map CSV columns manually</summary>
                <p>Optional. Type the exact source header from your CSV for each Glide field.</p>
                <div className="mapper-grid">
                  {mappingFields.map((field) => (
                    <label key={field.name}>
                      <span>{field.label}</span>
                      <input name={field.name} placeholder={field.placeholder} />
                    </label>
                  ))}
                </div>
              </details>

              <button type="submit">Import products <span>-&gt;</span></button>
            </form>
          </details>

          <details className="action-drawer">
            <summary className="page-action">Set stock <span>Update</span></summary>
            <form action={setStock.bind(null, vendorId)}>
              <strong>Update stock count</strong>
              <label>
                <span>Product</span>
                <select name="product_id" required>
                  <option value="">Choose a product</option>
                  {products?.map((product) => (
                    <option value={product.id} key={product.id}>{product.name}</option>
                  ))}
                </select>
              </label>
              <div className="form-pair">
                <label><span>Quantity</span><input name="quantity" type="number" min="0" required /></label>
                <label><span>Low warning</span><input name="threshold" type="number" min="0" defaultValue="5" /></label>
              </div>
              <button type="submit">Save stock count <span>-&gt;</span></button>
            </form>
          </details>

          <details className="action-drawer">
            <summary className="page-action">Add product <span>+</span></summary>
            <form action={createProduct.bind(null, vendorId)}>
              <strong>New catalog product</strong>
              <label><span>Product name</span><input name="name" required /></label>
              <label><span>Barcode</span><input name="barcode" inputMode="numeric" /></label>
              <div className="form-pair">
                <label><span>Price (NGN)</span><input name="price" type="number" min="0" step="0.01" required /></label>
                <label><span>Opening stock</span><input name="quantity" type="number" min="0" defaultValue="0" /></label>
              </div>
              <div className="form-pair">
                <label><span>SKU</span><input name="sku" /></label>
                <label><span>Category</span><input name="category" /></label>
              </div>
              <label className="check-field">
                <input name="tracks_inventory" type="checkbox" defaultChecked />
                <span>Track stock for this product</span>
              </label>
              <button type="submit">Create product <span>-&gt;</span></button>
            </form>
          </details>
        </div>
      </header>

      {query.imported ? <p className="inventory-notice success">{query.imported} products and their opening stock were imported.</p> : null}
      {query.bulkError ? <p className="inventory-notice error">{bulkErrors[query.bulkError] ?? 'The bulk import could not be completed.'}</p> : null}

      <section className="dash-surface table-surface">
        <div className="table-toolbar"><strong>{products?.length ?? 0} products</strong><span>{store.location?.name ?? 'All locations'}</span></div>
        {products?.length ? (
          <div className="data-table inventory-table">
            <div className="table-row table-header"><span>Product</span><span>Barcode</span><span>Category</span><span>Stock</span><span>Price</span></div>
            {products.map((product) => {
              const stocks = product.location_inventory as unknown as { quantity: number; low_stock_threshold: number }[]
              const quantity = stocks?.reduce((sum, stock) => sum + stock.quantity, 0) ?? 0
              const threshold = stocks?.[0]?.low_stock_threshold ?? 0
              const low = product.is_available && quantity <= threshold

              return (
                <div className="table-row" key={product.id}>
                  <span className="product-cell">
                    <i>{product.name.slice(0, 1)}</i>
                    <span><strong>{product.name}</strong><small>{product.sku ?? (product.is_available ? 'Available' : 'Hidden')}</small></span>
                  </span>
                  <strong className="barcode-value">{product.barcode ?? '-'}</strong>
                  <span>{product.category ?? 'Uncategorised'}</span>
                  <strong className={low ? 'stock-low' : ''}>{quantity} {low ? <small>Low</small> : null}</strong>
                  <strong>{formatNaira(product.price_kobo)}</strong>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="truthful-empty wide">
            <span>Inventory is empty</span>
            <h3>Add your real catalog when the product API is connected.</h3>
            <p>No sample products have been inserted.</p>
          </div>
        )}
      </section>
    </div>
  )
}

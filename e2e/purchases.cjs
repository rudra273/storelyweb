// Real browser/rendering with explicit API fixtures. API transaction behavior is
// separately validated in storelyapi/tests/test_purchase_receipts.py.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const staging = process.env.PURCHASE_STAGING === '1'
const output = process.env.PURCHASE_SCREENSHOTS || ('/tmp/storely-purchase-browser' + (staging ? '-staging' : ''))
const origin = process.env.PURCHASE_WEB_ORIGIN || 'http://127.0.0.1:5175'
const product = { uuid:'p1',name:'Basmati Rice',product_code:'RICE-1',barcode:null,unit_name:'kg',unit_uuid:null,category_name:null,category_uuid:null,hsn_code:null,gst_percent:null,selling_price:'30',purchase_price:'18.2555',quantity:'10',track_stock:true,low_stock:false,next_expiry:null,reorder_level:null,mrp_price:null,updated_at:'2026-10-29' }
const supplier = { uuid:'supplier1',name:'Asha Wholesale',phone:null,email:null,gstin:null,address:null,notes:null }
;(async () => {
  fs.mkdirSync(output,{recursive:true})
  const browser=await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {}) })
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1100}})
    const page=await context.newPage()
    const requests=[]
    let suppliers=[]
    await page.route('**/v1/**', async route => {
      const request=route.request(), path=new URL(request.url()).pathname
      let body={}
      let status=200
      if(path==='/v1/auth/refresh') body={access_token:'browser-fixture',expires_in:900}
      else if(path==='/v1/me/premium-requests') body=[]
      else if(path==='/v1/me') body={id:'fixture-user',email:'fixture@example.com',full_name:'Shop Owner',email_verified:true}
      else if(path==='/v1/shops') body=[{shop_id:'s1',name:'Asha Stores',role:'owner'}]
      else if(path.endsWith('/entitlement')) body={shop_id:'s1',plan:'premium',status:'active',effective_status:'active',starts_at:'2020-01-01T00:00:00Z',ends_at:'2099-01-01T00:00:00Z',revision:1,updated_at:'2026-01-01T00:00:00Z',server_time:'2026-01-01T00:00:00Z',cloud_sync:true,web_access:true}
      else if(path.endsWith('/products') && request.method()==='POST') throw new Error('Catalog write before purchase confirmation')
      else if(path.endsWith('/products')) body={items:[product],total:1,next_cursor:null}
      else if(path.endsWith('/suppliers')) {
        if(request.method()==='POST') {suppliers=[supplier]; body=supplier;status=201} else body=suppliers
      }
      else if(path.endsWith('/purchase-receipts/import-preview')) body={fingerprint:'b'.repeat(64),possible_duplicate:false,warnings:[],rows:[{number:2,name:'Basmati Rice',item:{product_uuid:null,new_product:{client_key:'preview-rice-key',name:'Basmati Rice'},quantity:'3',unit_cost:'15',batch_no:'IMPORT-B',expiry_date:null},candidates:[{uuid:'p1',name:product.name,unit_name:'kg'}],requires_choice:true,error:null},{number:3,name:'Invalid row',item:null,candidates:[],requires_choice:false,error:'Quantity is required'}]}
      else if(path.endsWith('/purchase-receipts') && request.method()==='POST') {
        const data=request.postDataJSON();requests.push(data)
        if(requests.length===1) {status=500;body={error:{code:'internal_error',message:'Simulated uncertain response.'}}}
        else {status=201;body={uuid:'receipt1',supplier_uuid:data.supplier_uuid,supplier_name:supplier.name,purchase_date:data.purchase_date,invoice_number:data.invoice_number,notes:data.notes,subtotal:staging?'103.14':'45.64',payment_status:'not_recorded',created_at:new Date().toISOString(),items:data.items.map((item,i)=>({...item,uuid:'item'+i,product_name:item.new_product?.name ?? product.name,unit_name:item.new_product?.unit_name ?? 'kg',amount:'45.64',movement_uuid:'movement'+i,line_number:i+1}))}}
      }
      else if(path.endsWith('/categories') || path.endsWith('/units')) body=[]
      else throw new Error('Unexpected fixture request: '+path)
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
    })
    await page.goto(origin+'/products')
    await page.getByRole('button',{name:'Add purchase',exact:true}).click()
    await page.getByRole('button',{name:'Add Basmati Rice',exact:true}).click()
    await page.getByLabel('Quantity · item 1',{exact:true}).fill('2.5')
    await page.getByRole('button',{name:'Add supplier',exact:true}).click()
    await page.getByRole('dialog',{name:'Add supplier',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click()
    await page.getByRole('dialog',{name:'Add purchase',exact:true}).waitFor()
    assert.equal(await page.getByLabel('Quantity · item 1',{exact:true}).inputValue(),'2.5')
    await page.getByRole('button',{name:'Add supplier',exact:true}).click()
    await page.getByLabel('Supplier name',{exact:true}).fill('Asha Wholesale')
    await page.getByRole('button',{name:'Save supplier',exact:true}).click()
    await page.getByRole('dialog',{name:'Add supplier',exact:true}).waitFor({state:'hidden'})
    assert.equal(await page.getByLabel('Supplier (optional)',{exact:true}).inputValue(),'supplier1')
    if(staging) {
      await page.getByRole('button',{name:'New product',exact:true}).click()
      await page.getByLabel('New product name',{exact:true}).fill('Staged Tea')
      await page.getByLabel('New product unit cost (₹)',{exact:true}).fill('12.50')
      await page.getByRole('button',{name:'Stage product',exact:true}).click()
      await page.getByRole('button',{name:'Import purchase file',exact:true}).click()
      await page.getByLabel('Purchase CSV or Excel file',{exact:true}).setInputFiles({name:'purchase.csv',mimeType:'text/csv',buffer:Buffer.from('product_name,quantity,purchase_price\nRice,3,15')})
      await page.getByLabel('Match row 2',{exact:true}).selectOption('p1')
      await page.screenshot({path:output+'/import-review.png'})
      await page.getByLabel('Exclude row 3',{exact:true}).check()
      await page.getByRole('button',{name:'Stage 1 purchase items',exact:true}).click()
      assert.equal(requests.length,0)
    }
    await page.screenshot({path:output+'/desktop.png'})
    await page.setViewportSize({width:390,height:844})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
    await page.getByLabel('Quantity · item 1',{exact:true}).click()
    await page.screenshot({path:output+'/narrow.png'})
    await page.getByRole('button',{name:'Save purchase',exact:true}).click()
    await page.getByText('Simulated uncertain response.',{exact:true}).waitFor()
    assert.equal(await page.getByLabel('Quantity · item 1',{exact:true}).isDisabled(),true)
    await page.reload()
    await page.getByRole('button',{name:'Add purchase',exact:true}).click()
    await page.getByRole('button',{name:'Retry purchase',exact:true}).click()
    await page.getByRole('dialog',{name:'Purchase saved',exact:true}).waitFor()
    assert.deepEqual(requests[0],requests[1])
    if(staging) {
      assert.equal(requests[0].items.length,3)
      assert.equal(requests[0].items[1].new_product.name,'Staged Tea')
      assert.equal(requests[0].items[2].import_row_number,2)
      assert.deepEqual(requests[0].import_keys,['b'.repeat(64)])
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('storely.purchase-draft.v1:fixture-user:s1')),null)
    process.stdout.write('PASS: '+(staging?'staged new products and reviewed imports, ':'')+'native dialogs, narrow layout, reload recovery and identical retry payload\n')
  } finally {await browser.close()}
})().catch(error=>{process.stderr.write(String(error)+'\n');process.exitCode=1})

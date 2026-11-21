import { Link, Route, Routes } from 'react-router'
import { DirtyProvider } from './lib/DirtyProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider } from './auth/AuthProvider'
import { AppLayout } from './components/layout/AppLayout'
import { PublicOnly, RequireAuth, RequireCapability } from './components/guards'
import { BillsPage } from './billing/BillsPage'
import { NewBill } from './billing/NewBill'
import { BillDetailPage } from './billing/BillDetailPage'
import { InvoiceSettingsPage } from './billing/invoice/InvoiceSettingsPage'
import { ProductsPage } from './products/ProductsPage'
import { CustomersPage } from './customers/CustomersPage'
import { ExpensesPage } from './customers/ExpensesPage'
import { Overview } from './reports/Overview'
import { ExpiringPage, PurchasesPage, StockValuePage, TaxPage } from './reports/Registers'
import { ReportsLayout } from './reports/ReportsLayout'
import { DayBookPage, ProfitLossPage, ReceivablesPage } from './reports/Statements'
import { ForgotPassword } from './pages/auth/ForgotPassword'
import { Home } from './pages/dashboard/Home'
import { Login } from './pages/auth/Login'
import { ResetPassword } from './pages/auth/ResetPassword'
import { ShopActivity } from './pages/shop/ShopActivity'
import { Signup } from './pages/auth/Signup'
import { Team } from './pages/shop/Team'
import { VerifyEmail } from './pages/auth/VerifyEmail'
import { DeleteAccount } from './pages/account/DeleteAccount'
import { Profile } from './pages/account/Profile'
import { Security } from './pages/account/Security'
import { ShopGate } from './shops/ShopGate'
import { ShopProvider } from './shops/ShopProvider'
import { PlatformLayout, PlatformGate } from './platform/PlatformLayout'
import { PlatformOverview } from './platform/Overview'
import { PlatformShops } from './platform/Shops'
import { PlatformRequests } from './platform/Requests'
import { PlatformHistory } from './platform/History'
import { RequirePaid, SubscriptionStatus } from './subscriptions/Status'
import { PremiumRequestPage } from './subscriptions/PremiumRequestPage'
import { AccountLayout } from './components/layout/AccountLayout'
import { PurchaseInvoicesPage } from './purchases/PurchaseInvoicesPage'
import { PurchaseDetailPage } from './purchases/PurchaseDetailPage'
import { PurchaseWorkspacePage } from './purchases/PurchaseWorkspace'
import { SuppliersPage } from './products/suppliers/SuppliersPage'
import { SupplierDetailPage } from './products/suppliers/SupplierDetailPage'

function NotFound() {
  return (
    <main className="auth">
      <div className="auth-card">
        <h1>Page not found</h1>
        <p><Link to="/">Go to the start page</Link></p>
      </div>
    </main>
  )
}

/** Needs a router and a QueryClientProvider around it (see main.tsx and the tests). */
export default function App() {
  return (
    <ThemeProvider><AuthProvider><ToastProvider><DirtyProvider>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
        </Route>
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route element={<RequireAuth />}>
          <Route element={<AccountLayout />}><Route path="request-premium" element={<PremiumRequestPage />} /></Route>
          <Route path="account" element={<AccountLayout />}>
            <Route index element={<Profile />} />
            <Route path="security" element={<Security />} />
          </Route>
          <Route path="platform" element={<PlatformLayout />}>
            <Route path="account/security" element={<Security />} />
            <Route path="account" element={<Profile />} />
            <Route element={<PlatformGate />}>
              <Route index element={<PlatformOverview />} />
              <Route path="shops" element={<PlatformShops />} />
              <Route path="requests" element={<PlatformRequests />} />
              <Route path="history" element={<PlatformHistory />} />
            </Route>
          </Route>
          <Route
            element={
              <ShopProvider>
                <ShopGate />
              </ShopProvider>
            }
          >
            <Route element={<AppLayout />}>
              <Route path="subscription" element={<SubscriptionStatus />} />
              <Route element={<RequirePaid />}>
              <Route index element={<Home />} />
              <Route element={<RequireCapability needs="products.view" />}>
                <Route path="products" element={<ProductsPage />} />
                <Route path="products/:id" element={<ProductsPage />} />
              </Route>
              <Route element={<RequireCapability needs="products.edit" />}>
                <Route path="purchases" element={<PurchaseInvoicesPage />} />
                <Route path="purchases/new" element={<PurchaseWorkspacePage />} />
                <Route path="purchases/:id" element={<PurchaseDetailPage />} />
                <Route path="suppliers" element={<SuppliersPage />} />
                <Route path="suppliers/:id" element={<SupplierDetailPage />} />
              </Route>
              <Route element={<RequireCapability needs="reports.view" />}>
                <Route path="reports" element={<ReportsLayout />}>
                  <Route index element={<Overview />} />
                  <Route path="day-book" element={<DayBookPage />} />
                  <Route path="profit-loss" element={<ProfitLossPage />} />
                  <Route path="receivables" element={<ReceivablesPage />} />
                  <Route path="expiring" element={<ExpiringPage />} />
                  <Route path="purchases" element={<PurchasesPage />} />
                  <Route path="tax" element={<TaxPage />} />
                  <Route path="stock" element={<StockValuePage />} />
                </Route>
              </Route>
              <Route element={<RequireCapability needs="billing.create" />}>
                <Route path="billing" element={<BillsPage />} />
                <Route path="billing/new" element={<NewBill />} />
                <Route path="billing/:id" element={<BillDetailPage />} />
              </Route>
              <Route element={<RequireCapability needs="customers.view" />}>
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:id" element={<CustomersPage />} />
              </Route>
              <Route element={<RequireCapability needs="expenses.manage" />}>
                <Route path="expenses" element={<ExpensesPage />} />
              </Route>
              <Route element={<RequireCapability needs="team.manage" />}>
                <Route path="team" element={<Team />} />
              </Route>
              <Route element={<RequireCapability needs="shop.events" />}>
                <Route path="activity" element={<ShopActivity />} />
              </Route>
              <Route element={<RequireCapability needs="shop.settings" />}>
                <Route path="settings" element={<InvoiceSettingsPage />} />
              </Route>
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DirtyProvider></ToastProvider></AuthProvider></ThemeProvider>
  )
}

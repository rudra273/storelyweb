import { Link, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { PublicOnly, RequireAuth, RequireCapability } from './components/guards'
import { BillsPage } from './billing/BillsPage'
import { NewBill } from './billing/NewBill'
import { BillDetailPage } from './billing/BillDetailPage'
import { ProductsPage } from './products/ProductsPage'
import { Overview } from './reports/Overview'
import { ExpiringPage, PurchasesPage, StockValuePage, TaxPage } from './reports/Registers'
import { ReportsLayout } from './reports/ReportsLayout'
import { DayBookPage, ProfitLossPage, ReceivablesPage } from './reports/Statements'
import { ForgotPassword } from './pages/ForgotPassword'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { ShopActivity } from './pages/ShopActivity'
import { Signup } from './pages/Signup'
import { Team } from './pages/Team'
import { VerifyEmail } from './pages/VerifyEmail'
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
import { AccountLayout } from './components/AccountLayout'

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
    <AuthProvider>
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
              <Route element={<RequireCapability needs="team.manage" />}>
                <Route path="team" element={<Team />} />
              </Route>
              <Route element={<RequireCapability needs="shop.events" />}>
                <Route path="activity" element={<ShopActivity />} />
              </Route>
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

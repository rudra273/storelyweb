import { Link, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { PublicOnly, RequireAuth, RequireCapability } from './components/guards'
import { ComingSoon } from './pages/ComingSoon'
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
          <Route
            element={
              <ShopProvider>
                <ShopGate />
              </ShopProvider>
            }
          >
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="account" element={<Profile />} />
              <Route path="account/security" element={<Security />} />
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
                <Route path="billing" element={<ComingSoon title="Billing" note="Billing on the web arrives after reports." />} />
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

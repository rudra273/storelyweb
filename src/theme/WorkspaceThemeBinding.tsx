import { useContext, useLayoutEffect } from 'react'
import { useAuth } from '../auth/context'
import { useShop } from '../shops/context'
import { useShopAccess } from '../subscriptions/context'
import { ThemeScopeContext } from './scope'

/** Scope appearance without remounting the workspace or any unfinished form. */
export function WorkspaceThemeBinding() {
  const bind = useContext(ThemeScopeContext)
  const user = useAuth().user?.id ?? ''
  const shop = useShop().current?.shop_id ?? ''
  const { active, pending } = useShopAccess()
  useLayoutEffect(() => {
    if (bind && user && shop) return bind(user, shop, active, pending)
  }, [bind, user, shop, active, pending])
  return null
}

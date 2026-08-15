'use client'

import { useSettingsTab } from './settings-nav'
import { CompaniesPanel } from './companies-panel'
import { DepartmentsPanel } from './departments-panel'
import { RolesPanel } from './roles-panel'
import { BookingOptionsPanel } from './booking-options-panel'
import { AutomationsPanel } from './automations-panel'
import {
  GeneralPanel,
  NotificationsPanel,
  SessionsPanel,
} from './generic-panels'

export function SettingsContent() {
  const tab = useSettingsTab()

  switch (tab) {
    case 'companies':
      return <CompaniesPanel />
    case 'departments':
      return <DepartmentsPanel />
    case 'roles':
      return <RolesPanel />
    case 'booking-options':
      return <BookingOptionsPanel />
    case 'general':
      return <GeneralPanel />
    case 'notifications':
      return <NotificationsPanel />
    case 'automations':
      return <AutomationsPanel />
    case 'sessions':
      return <SessionsPanel />
  }
}

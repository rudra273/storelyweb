import type { components } from './schema'

// Friendly names for the generated schema (src/api/schema.d.ts, from openapi.json).
type S = components['schemas']

export type Me = S['MeOut']
export type Shop = S['ShopOut']
export type Member = S['MemberOut']
export type Invite = S['InviteOut']
export type MyInvite = S['MyInviteOut']
export type Session = S['SessionOut']
export type SecurityEvent = S['EventOut']
export type ShopEvent = S['ShopEventOut']
export type MfaStatus = S['MfaStatusOut']
export type MfaSetup = S['MfaSetupOut']
export type LoginResult = S['LoginOut']
export type Role = 'owner' | 'admin' | 'staff'

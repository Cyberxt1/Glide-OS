import { requireStoreContext } from '@/lib/store/context'
import { readableStatus } from '@/lib/store/format'
import { createClient } from '@/lib/supabase/server'
import { addTeamMember } from './actions'

const teamErrors: Record<string, string> = {
  access: 'Administrator access is required.',
  details: 'Complete every field, choose a role, and use at least 8 password characters.',
  exists: 'That email already belongs to a Supabase account.',
  account: 'The team account could not be created.',
  profile: 'The staff profile failed, so the account was rolled back.',
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>
  searchParams: Promise<{ added?: string; error?: string }>
}) {
  const { vendorId } = await params
  const query = await searchParams
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const [{ data: team }, { data: locations }] = await Promise.all([
    supabase.from('merchant_staff').select('id, display_name, staff_code, roles, is_active, last_seen_at, store_locations(name)').eq('merchant_id', store.id).order('display_name'),
    supabase.from('store_locations').select('id, name').eq('merchant_id', store.id).eq('is_active', true).order('name'),
  ])

  return (
    <div className="dash-page">
      <header className="page-head compact"><div><p className="dash-kicker">Access control</p><h1>Store team</h1><p>One operating system, precisely limited by responsibility.</p></div><details className="action-drawer"><summary className="page-action">Add team member <span>+</span></summary><form action={addTeamMember.bind(null, vendorId)}><strong>New team member</strong><p className="drawer-note">Create a confirmed staff login and limit the workspace to the jobs they perform.</p><label><span>Full name</span><input name="display_name" required /></label><label><span>Email address</span><input name="email" type="email" required /></label><label><span>Temporary password</span><input name="temporary_password" type="password" minLength={8} required /></label><label><span>Assigned location</span><select name="location_id"><option value="">All locations</option>{locations?.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><fieldset className="role-picker"><legend>Workspace access</legend><label><input name="roles" type="checkbox" value="cashier" defaultChecked /><span><strong>Cashier</strong><small>Scan paid orders and pack goods</small></span></label><label><input name="roles" type="checkbox" value="security" /><span><strong>Security</strong><small>Verify and confirm customer exits</small></span></label></fieldset><button type="submit">Create staff login <span>→</span></button></form></details></header>
      {query.added ? <p className="inventory-notice success">Team member created. Share their temporary password securely.</p> : null}
      {query.error ? <p className="inventory-notice error">{teamErrors[query.error] ?? 'The team member could not be added.'}</p> : null}
      <section className="dash-surface table-surface">
        <div className="table-toolbar"><strong>{team?.length ?? 0} team members</strong><span>Role-bound access</span></div>
        {team?.length ? (
          <div className="data-table team-table">
            <div className="table-row table-header"><span>Person</span><span>Staff code</span><span>Location</span><span>Roles</span><span>Status</span></div>
            {team.map((member) => {
              const location = member.store_locations as unknown as { name: string } | null
              return <div className="table-row" key={member.id}><span className="product-cell"><i>{member.display_name.slice(0, 1)}</i><strong>{member.display_name}</strong></span><strong>{member.staff_code}</strong><span>{location?.name ?? 'All locations'}</span><span className="role-list">{member.roles.map((role: string) => <i key={role}>{readableStatus(role)}</i>)}</span><span><i className={`status-orb ${member.is_active ? 'status-active' : 'status-disabled'}`} />{member.is_active ? 'Active' : 'Disabled'}</span></div>
            })}
          </div>
        ) : <div className="truthful-empty wide"><span>No staff profiles</span><h3>You are currently the only store operator.</h3><p>Cashier and security access will appear here when created.</p></div>}
      </section>
    </div>
  )
}

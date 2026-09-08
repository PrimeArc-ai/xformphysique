-- Allow an assigned coach to append an immutable audit event for a client they
-- manage. Application mutations still use the coach's JWT, so the policy is
-- evaluated in addition to the API's explicit role and ownership checks.

create policy audit_events_insert_assigned_coach
  on public.audit_events for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid())
    and client_id is not null
    and (select public.can_manage_client(client_id))
  );

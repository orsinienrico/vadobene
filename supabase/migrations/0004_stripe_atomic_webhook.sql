-- 0004: Stripe webhook effetto + ledger in UNA transazione.
-- Eseguire PRIMA del deploy delle route che chiamano process_stripe_event.
-- Se un evento arriva simultaneamente due volte, la unique key sul ledger
-- serializza le transazioni; nessun credito viene applicato due volte.
create or replace function public.process_stripe_event(
  p_event_id text,
  p_user_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  if p_event_id is null or length(p_event_id) < 1 or p_user_id is null then
    raise exception 'Stripe event id / user id missing';
  end if;
  if p_action not in ('boost', 'pro', 'free') or p_action is null then
    raise exception 'Unsupported Stripe action: %', p_action;
  end if;

  insert into public.processed_events(id)
  values (p_event_id)
  on conflict(id) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) = false then
    return false; -- Evento già applicato e committato.
  end if;

  if p_action = 'boost' then
    perform public.award_jury_credit(p_user_id, 5);
  elsif p_action = 'pro' then
    update public.users set plan = 'pro' where id = p_user_id;
    if not found then raise exception 'Stripe user not found: %', p_user_id; end if;
  elsif p_action = 'free' then
    update public.users set plan = 'free' where id = p_user_id;
    if not found then raise exception 'Stripe user not found: %', p_user_id; end if;
  end if;

  return true;
end;
$$;

revoke execute on function public.process_stripe_event(text, uuid, text)
from public, anon, authenticated;
grant execute on function public.process_stripe_event(text, uuid, text)
to service_role;

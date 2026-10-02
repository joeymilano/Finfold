-- Give OAuth Server access tokens an MCP-specific audience. Normal Finfold
-- browser sessions have no OAuth Server client_id and remain unchanged.
--
-- Supabase stores the RFC 8707 resource on the authorization request, but its
-- Custom Access Token Hook payload only guarantees client_id, scope, and the
-- standard JWT claims. Select the resource from the exact Supabase issuer so
-- authorization-code and refresh-token issuance produce the same audience.
-- After applying this migration, enable this function in Supabase Dashboard:
-- Authentication > Hooks > Custom Access Token.
create or replace function public.finfold_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  claims jsonb;
  oauth_client_id text;
  token_issuer text;
  mcp_audience text;
begin
  claims := coalesce(event->'claims', '{}'::jsonb);
  oauth_client_id := nullif(claims->>'client_id', '');
  if oauth_client_id is null then
    return jsonb_build_object('claims', claims);
  end if;

  token_issuer := nullif(claims->>'iss', '');
  -- Substitute your own Supabase project refs below (Dashboard > Settings > API).
  mcp_audience := case token_issuer
    when 'https://your-project-ref.supabase.co/auth/v1'
      then 'https://www.finfold.app/mcp'
    when 'https://your-staging-project-ref.supabase.co/auth/v1'
      then 'https://staging.finfold.app/mcp'
    else null
  end;

  if mcp_audience is null then
    return jsonb_build_object('claims', claims);
  end if;

  claims := jsonb_set(claims, '{aud}', to_jsonb(mcp_audience), true);
  claims := jsonb_set(claims, '{finfold_mcp}', 'true'::jsonb, true);
  return jsonb_build_object('claims', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.finfold_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.finfold_mcp_access_token_hook(jsonb) from public, anon, authenticated;

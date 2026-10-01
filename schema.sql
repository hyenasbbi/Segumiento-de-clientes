-- Isolated tracker tables. Browser roles have no direct access.
create table public.ct_sellers(id uuid primary key default gen_random_uuid(),name text not null unique,created_at timestamptz not null default now());
create table public.ct_access(token_hash text primary key,role text not null check(role in ('admin','seller')),seller_id uuid references public.ct_sellers(id),created_at timestamptz not null default now(),check((role='admin' and seller_id is null) or (role='seller' and seller_id is not null)));
create unique index ct_one_seller_key on public.ct_access(seller_id) where seller_id is not null;
create table public.ct_clients(id uuid primary key default gen_random_uuid(),seller_id uuid not null references public.ct_sellers(id),identity text not null,name text not null,network text not null default 'Instagram',url text not null default '',first_sale date,last_sale date,paid numeric(14,2) not null default 0 check(paid>=0),pending numeric(14,2) not null default 0 check(pending>=0),sales integer not null default 1 check(sales>=0),status text not null default 'seguimiento' check(status in ('activo','muerto','seguimiento')),notes text not null default '',marked_at timestamptz,version integer not null default 0,imported_at timestamptz not null default now(),unique(seller_id,identity),check(first_sale is null or last_sale is null or first_sale<=last_sale));
create index ct_clients_identity on public.ct_clients(identity);
create index ct_clients_status on public.ct_clients(status);
create table public.ct_history(id bigint generated always as identity primary key,client_id uuid not null references public.ct_clients(id),actor text not null,status text not null,notes text not null,created_at timestamptz not null default now());
create index ct_history_client on public.ct_history(client_id,created_at);
create table public.ct_imports(id bigint generated always as identity primary key,seller_id uuid not null references public.ct_sellers(id),filename text not null,row_count integer not null,created_at timestamptz not null default now());
alter table public.ct_sellers enable row level security;
alter table public.ct_access enable row level security;
alter table public.ct_clients enable row level security;
alter table public.ct_history enable row level security;
alter table public.ct_imports enable row level security;
revoke all on public.ct_sellers,public.ct_access,public.ct_clients,public.ct_history,public.ct_imports from anon,authenticated;
grant all on public.ct_sellers,public.ct_access,public.ct_clients,public.ct_history,public.ct_imports to service_role;
grant usage,select on sequence public.ct_history_id_seq,public.ct_imports_id_seq to service_role;
create function public.ct_import(p_seller uuid,p_rows jsonb,p_filename text) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.ct_clients(seller_id,identity,name,network,url,first_sale,last_sale,paid,pending,sales)
 select p_seller,x.identity,x.name,x.network,x.url,x.first_sale,x.last_sale,x.paid,x.pending,x.sales
 from jsonb_to_recordset(p_rows) as x(identity text,name text,network text,url text,first_sale date,last_sale date,paid numeric,pending numeric,sales integer)
 on conflict(seller_id,identity) do update set name=excluded.name,network=excluded.network,url=excluded.url,first_sale=excluded.first_sale,last_sale=excluded.last_sale,paid=excluded.paid,pending=excluded.pending,sales=excluded.sales,imported_at=now();
 get diagnostics n=row_count;
 insert into public.ct_imports(seller_id,filename,row_count) values(p_seller,p_filename,n);
 return n;
end $$;
create function public.ct_mark(p_id uuid,p_seller uuid,p_status text,p_notes text,p_version integer,p_actor text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ct_clients;
begin
 update public.ct_clients set status=p_status,notes=p_notes,marked_at=now(),version=version+1 where id=p_id and (p_seller is null or seller_id=p_seller) and version=p_version returning * into r;
 if not found then raise exception 'CONFLICT_OR_NOT_FOUND'; end if;
 insert into public.ct_history(client_id,actor,status,notes) values(r.id,p_actor,r.status,r.notes);
 return to_jsonb(r);
end $$;
revoke all on function public.ct_import(uuid,jsonb,text),public.ct_mark(uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.ct_import(uuid,jsonb,text),public.ct_mark(uuid,uuid,text,text,integer,text) to service_role;
insert into public.ct_sellers(name) values('Angi Acosta'),('Esteban Basaure'),('Carlos da Silva'),('Joa');
create function public.ct_rotate_link(p_seller uuid,p_hash text) returns void language sql security invoker set search_path='' as $$
 insert into public.ct_access(token_hash,role,seller_id) values(p_hash,'seller',p_seller)
 on conflict(seller_id) where seller_id is not null do update set token_hash=excluded.token_hash,created_at=now();
$$;
revoke all on function public.ct_rotate_link(uuid,text) from public,anon,authenticated;
grant execute on function public.ct_rotate_link(uuid,text) to service_role;

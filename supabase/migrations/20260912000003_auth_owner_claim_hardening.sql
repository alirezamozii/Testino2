-- Auth owners must always be linked by the immutable Supabase auth UUID, never an email address.
ALTER TABLE public.owners
  ADD CONSTRAINT owners_account_auth_uuid_check
  CHECK (kind <> 'account' OR auth_user_id IS NOT NULL) NOT VALID;

ALTER TABLE public.owners VALIDATE CONSTRAINT owners_account_auth_uuid_check;

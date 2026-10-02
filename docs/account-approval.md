# Account approval flow

New registrations create a `pending` approval record through the Supabase auth trigger. Pending or rejected accounts cannot enter protected customer, merchant, or administrator areas until an administrator approves the account. Administrator-created accounts are approved automatically.

The approval state is enforced both at the request/proxy layer and in shared server session gates. Existing accounts were backfilled as approved when the feature was introduced.

The proxy reads the approval row through its authenticated Supabase client; the service-role approval helper remains server-only for shared session gates.

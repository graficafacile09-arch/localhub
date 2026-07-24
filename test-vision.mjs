import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const email = 'test-vision-' + Date.now() + '@test.local';
  const password = 'Test123!';

  const { data: userData, error: signUpError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (signUpError) {
    console.log('SIGNUP ERROR:', JSON.stringify(signUpError));
    process.exit(1);
  }

  const userId = userData.user.id;
  console.log('USER_ID:', userId);
  console.log('EMAIL:', email);

  const { data: storeData, error: storeError } = await supabase
    .from('negozi')
    .insert({
      owner_user_id: userId,
      nome: 'Test Store Vision',
      slug: 'test-store-vision-' + Date.now(),
      categoria: 'elettronica',
      attivo: true
    })
    .select()
    .single();

  if (storeError) {
    console.log('STORE ERROR:', JSON.stringify(storeError));
    process.exit(1);
  }

  console.log('STORE_ID:', storeData.id);

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (signInError) {
    console.log('SIGNIN ERROR:', JSON.stringify(signInError));
    process.exit(1);
  }

  console.log('ACCESS_TOKEN:', signInData.session.access_token);
}

main().catch(e => console.error(e));

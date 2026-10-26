# Forge sign-in and cloud saves

Local save and JSON backup work immediately, without any account.

To enable real cloud saves:
1. Create a Supabase project and use its SQL editor to run `supabase-setup.sql`.
2. In Supabase Authentication > Providers, enable GitHub. Configure a GitHub OAuth application with the callback URL provided by Supabase.
3. Add the deployed Forge website URL to Supabase Authentication's allowed redirect URLs.
4. Edit `forge-config.json` with your Supabase project URL and **publishable/anon** key only. Never commit a service-role key, GitHub client secret, or private credential.
5. Deploy the updated site, use Account > Sign In with GitHub, then Save Manager > Save to Cloud.

The project stores one cloud save slot named `main` per user, with row-level security enforcing user ownership. Cloud saving requires network access. Export JSON backups regularly. 

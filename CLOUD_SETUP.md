# Forge sign-in and cloud saves

Local save and JSON backup work immediately, without any account.

To enable real cloud saves:
1. Create a Supabase project and use its SQL editor to run `supabase-setup.sql`.
2. In Supabase Authentication > Providers, enable GitHub. Configure a GitHub OAuth application with the callback URL provided by Supabase.
3. Add the deployed Forge website URL to Supabase Authentication's allowed redirect URLs.
4. Edit `forge-config.json` with your Supabase project URL and **publishable/anon** key only. Never commit a service-role key, GitHub client secret, or private credential.
5. Deploy the updated site, use Account > Sign In with GitHub, then Save Manager > Save to Cloud.

The project stores one cloud save slot named `main` per user, with row-level security enforcing user ownership. Cloud saving requires network access. Export JSON backups regularly. 

## GitHub sign-in and private repository saves

The **Account > Sign In with GitHub** button uses Supabase GitHub OAuth. It will not work until you configure `forge-config.json`, Supabase GitHub provider, OAuth callback URL, and allowed site redirect URL as described above.

Forge requests GitHub OAuth `repo` and `read:user` scopes. The `repo` scope grants broad repository access, including private repositories; GitHub OAuth Apps do not offer a scope restricted to only `forge-game-saves`. Review the consent screen before authorizing. For narrower permissions, a future GitHub App backend is recommended.

After sign-in, open **Save Manager > Create My Private Saves Repo**. This creates `forge-game-saves` in the **signed-in user's** GitHub account, not the Forge developer's account. Then use **Save to GitHub Repo** and **Load from GitHub Repo**. Forge stores `project.json` and uses GitHub commits as save history. The code checks the repository is private before writing or loading.

GitHub's OAuth provider token may expire or be absent from a restored Supabase session. If repository actions say access expired, sign out and sign back in. Do not paste GitHub personal access tokens into Forge or commit tokens to the repository.

**Security and availability:** GitHub repo saves require network access and GitHub API availability. The save is a single project slot; local saves remain available without GitHub. The OAuth token is not intentionally stored in project JSON.

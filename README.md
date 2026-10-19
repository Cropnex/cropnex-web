# CropNex

CropNex is a farm management application built with Next.js, React and Supabase.

## Put this project in a GitHub repository

1. Create a new, empty repository under the GitHub account that will own CropNex. Do not add a README or other starter files.
2. On Windows, extract the project folder. Open that folder in File Explorer, right-click and choose **Open in Terminal**.
3. Run these commands, replacing the URL with the HTTPS URL shown on the new GitHub repository:

   ```powershell
   git init
   git add .
   git commit -m "Initial CropNex app"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPOSITORY.git
   git push -u origin main
   ```

4. On the repository page, choose **Code → Codespaces → Create codespace on main**.

Check that no passwords, API keys, or private `.env` files are in the project before uploading. This project ignores `.env*` files by default.

## Run in Codespaces

In the Codespaces terminal, run `npm install`, then `npm run dev`. Use the **Ports** panel to open port 3000. To connect the app, copy `.env.example` to `.env.local` and enter the values for the new CropNex Supabase project and any other services you use. Do not use the former AGCORE project's credentials.

For a live deployment, add the same environment values to the hosting provider's protected environment settings. The app's canonical site address is set to `https://www.cropnex.com` in `app/layout.tsx`. Configure the custom domain in your hosting provider, then update the domain's DNS records at its registrar using the values that provider gives you. DNS records depend on the chosen host.

## Notes

- Use a new Supabase project for CropNex if the new owner should have separate accounts and data. The database schema and migration history are in `supabase/migrations/`; review and apply them to the new project in order before using the app.
- Keep service credentials in environment settings, never in source files or GitHub.
- Update the Privacy, Terms and Acceptable Use pages with the new operator's legal details and contact information before launch.
- Some supplied marketing images retain the former product's visual identity and should be replaced before public launch.

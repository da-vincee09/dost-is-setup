UPLOAD THIS PROJECT TO CPANEL

This version uses the direct Supabase frontend client. You do not need to run a Node.js app in cPanel.

Upload these files/folders to public_html or your target domain folder:
- index.html
- favicon.svg
- src/

Important:
- Supabase credentials are in src/supabaseClient.js.
- Make sure your Supabase Auth/API settings allow your cPanel domain.
- Make sure your Supabase Row Level Security policies allow the anon key to read/write the tables your users need.
- If users still see an old "Something needs attention" message after upload, ask them to hard refresh with Ctrl+F5 or clear browser cache.

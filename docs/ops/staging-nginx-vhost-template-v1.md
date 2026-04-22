# Staging Nginx vhost template (v1)

Purpose: expose FSC staging app on `staging.fairsharecoin.org` over HTTPS and route to app port `4011`.

## Example server blocks

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name staging.fairsharecoin.org;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name staging.fairsharecoin.org;

    ssl_certificate     /etc/letsencrypt/live/staging.fairsharecoin.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.fairsharecoin.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4011;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Apply/check sequence

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I http://staging.fairsharecoin.org
curl -I https://staging.fairsharecoin.org
curl -sS https://staging.fairsharecoin.org/health
```

Expected:
- HTTP -> 301/308 redirect to HTTPS
- HTTPS responds (no timeout)
- `/health` returns `{ "ok": true }`

## Notes

- Keep staging isolated from production upstream and database.
- If certs are missing, provision via your standard ACME flow before enabling 443 server block.

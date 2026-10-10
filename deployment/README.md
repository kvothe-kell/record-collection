# Private Proxmox deployment

Prepared for the existing Pi-hole → Caddy → Infrastructure LXC architecture.
Target hostname: `vinyl.home.robertsousa.net`. No WAN forwarding.
Container IP and ID must be checked in Proxmox/Omada before allocating them.

## 1. Create the container

Use an unprivileged Debian 12 LXC, 1 CPU, 1 GB RAM, 8 GB internal disk,
with start at boot enabled. Match the existing Infrastructure containers'
bridge/VLAN configuration rather than assuming a bridge tag. Reserve an unused
192.168.20.x address; gateway 192.168.20.1, DNS 192.168.20.2.
Keep database/artwork on the root disk, not an external bind mount excluded
from container backups. Record the new service in the network inventory.

## 2. Stage the app

Run these inside the new LXC as root through its Proxmox console:

```sh
apt update
apt install -y python3 python3-venv ca-certificates curl
useradd --system --user-group --home-dir /opt/record-collection --shell /usr/sbin/nologin vinyl
install -d -o vinyl -g vinyl /opt/record-collection
```

Transfer the application source into `/opt/record-collection`. Use the prepared
transfer archive after stopping the development app and the Pi sender for the
final cutover. Do not copy the Mac's venv or node_modules. Do not initialize a
new database over the existing one. The archive intentionally excludes `.env`.

```sh
cd /opt/record-collection
python3 -m venv venv
venv/bin/pip install -r deployment/requirements.txt
install -m 600 deployment/environment.example /etc/record-collection.env
```

Edit `/etc/record-collection.env` locally on the server to contain the existing
Discogs and Pi tokens. Do not paste tokens into chat. Systemd reads this file as
root; the app runs as vinyl. Keep the existing Pi token during migration.

```sh
chown -R vinyl:vinyl /opt/record-collection
install -m 644 deployment/record-collection.service /etc/systemd/system/record-collection.service
systemctl daemon-reload
systemctl enable --now record-collection
systemctl status record-collection --no-pager
curl --fail http://127.0.0.1:5002/api/records
```

Gunicorn imports `server:app`; the development `app.run(debug=True)` is not
executed. WorkingDirectory preserves the current relative database and artwork
paths. One worker with four threads keeps memory modest; requests use their own
SQLite connections. Verify simultaneous Pi posts and browser edits during testing.

## 3. Browser ingress

In Pi-hole add `vinyl.home.robertsousa.net` → `192.168.20.10` (Caddy).
On Caddy, back up `/opt/caddy/Caddyfile`, then add a site matching its existing
Cloudflare TLS configuration/snippet with this upstream:

```caddyfile
vinyl.home.robertsousa.net {
    # Reuse the actual existing DNS-01 TLS configuration here.
    reverse_proxy APP_INFRA_IP:5002
}
```

Replace APP_INFRA_IP. Inspect the actual Caddyfile before adding this block:
DNS-01 settings may be global, imported, or repeated per site. Preserve them.

```sh
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

The existing admin Tailscale grant covers Caddy HTTPS via the Proxmox subnet
router. Verify DNS and HTTPS from a phone on cellular with Wi-Fi disabled.
The app backend has no general user login: restrict port 5002 to Caddy,
monitoring, and the approved Pi/admin paths. Do not publish it on the internet.

## 4. Pi connection

Recommended: join this LXC as a dedicated tagged Tailscale node for the Pi's
app connection; browser traffic still uses Caddy. Configure LXC TUN access using
the host's supported Proxmox device settings, without making the LXC privileged.
Define `tag:vinyl` ownership before joining. Add the narrow grant:

```json
{"src":["tag:iot-pi"],"dst":["tag:vinyl"],"ip":["tcp:5002"]}
```

Preserve all existing grants/tests. Do not advertise extra VLAN routes.
Set the Pi's existing app base URL setting to the new node's MagicDNS name,
port 5002; retain its endpoint paths and token. Verify successful recognition
posts and new listening events before removing the temporary Pi → iMac grant.
Check the Pi's retry/buffering behavior before cutover to avoid lost events.
Alternative: use the existing subnet router with a Pi grant scoped only to the
new app IP and port; Linux Pi must accept subnet routes. Decide before applying.

## 5. Cutover, verification, backup, rollback

1. Stage dependencies and networking before the final copy.
2. Pause the Pi sender and stop the Mac Flask process; keep them stopped while
   packaging the database and covers. Do not continue editing the old app.
3. Create the transfer archive with `python3 deployment/package_transfer.py`.
4. Extract into the empty new application directory (or stop a staged server
   before replacing its data). Retain the original archive for rollback.
5. Start production; check database integrity, record count, artwork, stats,
   browser edits, and authenticated Pi posts. Verify service after LXC reboot.
6. Add the LXC explicitly to the nightly 02:00 `local-backup` VZDump job
   (existing notes list only containers 101–106). Run a manual backup.
7. Add Kuma checks for `http://APP_INFRA_IP:5002/api/records` and
   `https://vinyl.home.robertsousa.net/api/records`. Grant monitor access narrowly.
8. Restore backup to a new ID on an isolated network, without Tailscale or a
   running app sender. Confirm database/artwork before deleting the test copy.

If cutover fails before production writes, stop production and point the Pi back
to the Mac, then restart development. After production has received edits/events,
pause all writers and preserve the production database AND artwork before
rolling back; an old database would discard those writes.

Logs: `journalctl -u record-collection -n 100 --no-pager`.
Before updates, stop service and save a matched database/artwork backup, preserve
secrets, install reviewed code/dependencies, restart, and verify. Keep previous
code/dependencies available; database schema changes require a migration plan.

References: https://docs.gunicorn.org/en/stable/design.html and
https://caddyserver.com/docs/command-line .

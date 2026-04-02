# ExpressJS Myst Ubuntu 16 Setup README

This document captures the working process used to rebuild and run the legacy `expressjs-myst` application in a compatible Ubuntu 16 VM.

## Goal

Run the legacy app in an environment aligned to the original stack so it starts reliably and can automatically run on boot.

## Environment summary

Target VM baseline:

- Ubuntu `16.04.7 LTS`
- Static IP on `ens34`
- Node `4.2.6` via `nvm`
- npm `2.14.12`
- MongoDB `2.6.10`
- memcached `1.4.25`

Observed old environment:

- Ubuntu `16.04.2 LTS`
- Node `4.2.6`
- npm `3.5.2`
- MongoDB `2.6.10-0ubuntu1`
- memcached `1.4.25-2ubuntu1.2`

## VM creation / Ubuntu installation notes

Important choices during VM setup and Ubuntu install:

- In ESXi, the VM must use **Legacy BIOS** boot. Ubuntu 16 installer did not boot correctly with UEFI enabled.
- During Ubuntu installation, use **Guided - use entire disk**.
- Select **OpenSSH server** during package selection so SSH is available immediately after install.

## Static IP configuration

The VM network interface was `ens34`.

Original DHCP values observed before changing to static:

- temporary IP: `192.168.1.109/24`
- gateway: `192.168.1.1`
- DNS server: `192.168.1.253`
- search domain: `localdomain`

Desired static IP:

- `192.168.1.9`

Edit `/etc/network/interfaces`:

```text
# This file describes the network interfaces available on your system
# and how to activate them. For more information, see interfaces(5).

source /etc/network/interfaces.d/*

auto lo
iface lo inet loopback

auto ens34
iface ens34 inet static
    address 192.168.1.9
    netmask 255.255.255.0
    gateway 192.168.1.1
    dns-nameservers 192.168.1.253
    dns-search localdomain
```

Notes:

- Be careful not to remove the leading `#` from comment lines at the top of the file, or networking parsing will fail.
- Applying the change live over SSH was messy.
- The easiest reliable way to cut over from DHCP to the new static IP was to **reboot the VM**.
- After reboot, reconnect by SSH to `192.168.1.9`.

## Base package prep

Update package metadata:

```bash
sudo apt update
```

Install core tools:

```bash
sudo apt install -y git curl build-essential
```

## Install Node with nvm

Do not use Ubuntu’s `nodejs` package for this app. Use `nvm`.

Install `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Load it in the shell:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

Install and select Node `4.2.6`:

```bash
nvm install 4.2.6
nvm use 4.2.6
node -v
npm -v
```

Expected result:

- `node -v` → `v4.2.6`
- `npm -v` → `2.14.12`

## Install MongoDB and memcached

Check availability:

```bash
apt-cache policy mongodb memcached
```

Install:

```bash
sudo apt install -y mongodb memcached
```

Verify:

```bash
mongod --version | head -n 1
memcached -h | head -n 1
```

Expected:

- MongoDB `2.6.10`
- memcached `1.4.25`

Start or verify services:

```bash
sudo service mongodb start
sudo service memcached start
sudo service mongodb status
sudo service memcached status
```

## Clone the application

SSH cloning failed on the fresh VM because no GitHub SSH key was configured yet.

Use HTTPS instead:

```bash
git clone https://github.com/astigmatism/expressjs-myst.git
cd ~/expressjs-myst
```

## Install app dependencies

Install:

```bash
npm install
```

Useful version checks after install:

```bash
node -p "require('./node_modules/monk/package.json').version + ' / ' + require('./node_modules/mongodb/package.json').version"
```

Observed working values:

- `monk 0.9.0`
- `mongodb 2.0.2`

## Memcached / hashring dependency issue and fix

### Problem

After install, `npm start` failed because:

- `hashvalue.node` under `node_modules/memcached/node_modules/hashring/build/Release/` was a **Mach-O** binary
- that means a macOS native addon binary existed in the dependency tree
- Linux needs an ELF binary, so startup failed with `invalid ELF header`

### Diagnosis

Check binary type:

```bash
file ~/expressjs-myst/node_modules/memcached/node_modules/hashring/build/Release/hashvalue.node
```

If it says `Mach-O`, it must be rebuilt or dependency versions aligned.

### Important dependency alignment discovered from old working machine

Old working machine:

- `memcached` npm package: `2.2.2`
- top-level `hashring`: `3.2.0`

Fresh install on new VM initially produced a different tree:

- `memcached` npm package: `2.0.0`
- nested `hashring`: `3.0.0`

That did not match the old machine.

### Fix used

Install the historically matching versions explicitly:

```bash
cd ~/expressjs-myst
npm install memcached@2.2.2
npm install hashring@3.2.0
```

Also make sure Python 2 exists for old node-gyp behavior:

```bash
sudo apt install -y python
python --version
```

Expected:

- `Python 2.7.x`

After aligning dependencies and rebuilding, the app was able to start correctly.

## Running the app manually

Start from the project directory:

```bash
cd ~/expressjs-myst
npm start
```

## Run the app automatically at boot with systemd

Do not rely on an interactive shell session. Use a service.

### 1) Create app start wrapper

Create `/home/astigmatism/expressjs-myst/start-app.sh`:

```bash
#!/bin/bash
export NVM_DIR="/home/astigmatism/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd /home/astigmatism/expressjs-myst
nvm use 4.2.6 >/dev/null
exec npm start
```

Make it executable:

```bash
chmod +x /home/astigmatism/expressjs-myst/start-app.sh
```

### 2) Create systemd service

Create `/etc/systemd/system/expressjs-myst.service`:

```ini
[Unit]
Description=ExpressJS Myst Application
After=network.target mongodb.service memcached.service
Requires=mongodb.service memcached.service

[Service]
Type=simple
User=astigmatism
WorkingDirectory=/home/astigmatism/expressjs-myst
ExecStart=/home/astigmatism/expressjs-myst/start-app.sh
Restart=always
RestartSec=5
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
```

### 3) Enable and start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable expressjs-myst
sudo systemctl start expressjs-myst
```

### 4) Service management commands

Check status:

```bash
sudo systemctl status expressjs-myst --no-pager
```

View logs:

```bash
journalctl -u expressjs-myst -f
```

Stop:

```bash
sudo systemctl stop expressjs-myst
```

Start:

```bash
sudo systemctl start expressjs-myst
```

Restart:

```bash
sudo systemctl restart expressjs-myst
```

## Environment mode note

This application must run with `NODE_ENV=development`.

Although using `production` would normally be the default recommendation for deployment, this legacy project depends on development mode behavior and was not completed to a true production-ready state.

The `systemd` service should therefore use:

```ini
Environment=NODE_ENV=development
```

## Final working state

Confirmed working:

- `mongodb.service` active
- `memcached.service` active
- `expressjs-myst.service` active and running with `NODE_ENV=development`
- app starts automatically through systemd
- machine remains fully accessible over SSH while the app runs in the background

## Notes for future rebuilds

- Prefer Ubuntu 16 for this legacy app rather than trying to force Ubuntu 24 to behave like 2016.
- Use Legacy BIOS in ESXi.
- Use HTTPS clone unless GitHub SSH keys are already configured.
- Expect `npm install` to resolve differently unless dependency versions are explicitly corrected.
- If startup fails with `invalid ELF header` for `hashvalue.node`, check for a Mach-O binary and align `memcached` / `hashring` versions to the known working set.
- Use `systemd`, not a manual `startup.sh`, for boot-time startup.
- Keep `NODE_ENV=development` in the service definition for this app.


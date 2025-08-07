# RabbitMQ 3.13 + Erlang 26 — Single‑Node Install Guide (Ubuntu 24.04 “noble”)

> This guide pins to the **jammy** packages on Cloudsmith (they run fine on noble) and uses separate signed keyrings for the Erlang and RabbitMQ repos.

---

## 1  Become root & clean old entries

```bash
sudo -i                          # one root shell
rm -f /etc/apt/sources.list.d/rabbitmq*.list
rm -f /usr/share/keyrings/rabbitmq*.gpg
```

---

## 2  Import Cloudsmith GPG keys

```bash
# RabbitMQ Server key
curl -fsSL https://dl.cloudsmith.io/public/rabbitmq/rabbitmq-server/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/rabbitmq-archive-keyring.gpg

# Erlang key (different fingerprint)
curl -fsSL https://dl.cloudsmith.io/public/rabbitmq/rabbitmq-erlang/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/rabbitmq-erlang-keyring.gpg
```

---

## 3  Add the two repository lines

Create **/etc/apt/sources.list.d/rabbitmq.list** with exactly:

```
deb [signed-by=/usr/share/keyrings/rabbitmq-erlang-keyring.gpg] https://dl.cloudsmith.io/public/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main
deb [signed-by=/usr/share/keyrings/rabbitmq-archive-keyring.gpg] https://dl.cloudsmith.io/public/rabbitmq/rabbitmq-server/deb/ubuntu jammy main
```

*(nano or use a here‑doc — just remove any back‑slashes or prompt arrows)*

---

## 4  Update index & install RabbitMQ

```bash
apt-get update
apt-get install -y rabbitmq-server   # pulls Erlang 26 automatically
systemctl status rabbitmq-server --no-pager   # verify “active (running)”
```

---

## 5  Enable management UI & create admin

```bash
rabbitmq-plugins enable rabbitmq_management

rabbitmqctl add_user edge_admin STRONG_PASSWORD
rabbitmqctl set_user_tags edge_admin administrator
rabbitmqctl set_permissions -p / edge_admin ".*" ".*" ".*"
```

*Browse to* **http\://\<STATIC\_IP>:15672** → log in with **edge\_admin / STRONG\_PASSWORD**.

---

## 6  (Optional) Pin to jammy until noble repo appears

```bash
cat > /etc/apt/preferences.d/99-rabbitmq-pin <<'EOF'
Package: erlang-* rabbitmq-*
Pin: release n=jammy
Pin-Priority: 700
EOF
```

When Cloudsmith publishes a *noble* directory:

```bash
sed -i 's/jammy/noble/' /etc/apt/sources.list.d/rabbitmq.list
rm /etc/apt/preferences.d/99-rabbitmq-pin
apt-get update && apt-get dist-upgrade
```

---

## 7  Firewall ports you usually open

| Port  | Purpose       | Suggested source                    |
| ----- | ------------- | ----------------------------------- |
| 5671  | AMQP over TLS | your edge devices / office IP range |
| 15672 | Web admin UI  | your IP only                        |
| 22    | SSH           | your IP only                        |

---

## 8  Common service commands

```bash
systemctl stop|start|restart rabbitmq-server
rabbitmqctl list_users
rabbitmqctl list_queues -p /
rabbitmq-diagnostics status
```

---

**That’s it — ready for production or next‑time re‑install.**

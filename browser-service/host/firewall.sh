#!/bin/sh
# Egress policy for the browser container (subnet 172.30.0.0/24, bridge br-browser).
# Pages loaded by Chromium are untrusted: they may only reach public web ports, never the host,
# private ranges or the Hetzner metadata service (169.254.169.254). Run after Docker has started.
set -eu
NET=172.30.0.0/24

iptables -N BROWSER-EGRESS 2>/dev/null || iptables -F BROWSER-EGRESS
iptables -A BROWSER-EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
for dst in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 0.0.0.0/8 224.0.0.0/4; do
  iptables -A BROWSER-EGRESS -d "$dst" -j DROP
done
iptables -A BROWSER-EGRESS -p udp --dport 53 -d 185.12.64.1 -j RETURN
iptables -A BROWSER-EGRESS -p udp --dport 53 -d 185.12.64.2 -j RETURN
iptables -A BROWSER-EGRESS -p tcp -m multiport --dports 80,443 -j RETURN
iptables -A BROWSER-EGRESS -j DROP   # incl. UDP/443 (QUIC): Chrome falls back to TCP

iptables -D DOCKER-USER -s "$NET" -j BROWSER-EGRESS 2>/dev/null || true
iptables -I DOCKER-USER -s "$NET" -j BROWSER-EGRESS

# Traffic to the host itself (SSH, Caddy) goes through INPUT, not FORWARD.
iptables -D INPUT -s "$NET" -m conntrack --ctstate NEW -j DROP 2>/dev/null || true
iptables -I INPUT -s "$NET" -m conntrack --ctstate NEW -j DROP

echo "browser egress rules applied"

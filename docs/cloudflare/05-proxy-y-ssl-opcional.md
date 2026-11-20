# 05. Proxy y SSL de Cloudflare (opcional)

[← 04. Comprobar que el dominio resuelve](04-comprobar.md) · [Índice](README.md)

---

**Este paso es opcional.** Hazlo solo cuando el despliegue ya funcione con
HTTPS en los registros **DNS only** (ver
[`docs/dokploy/08-desplegar-y-comprobar.md`](../dokploy/08-desplegar-y-comprobar.md)).

## Qué cambia con el proxy (nube naranja)

Con **Proxied**, el tráfico pasa primero por Cloudflare y después llega a tu
VPS:

```text
navegador ──https──▶ Cloudflare ──https──▶ tu VPS (Traefik)
```

- **A favor:** la IP de tu VPS queda oculta, y Cloudflare filtra parte del
  tráfico malicioso y cachea contenido estático.
- **En contra:** agrega una pieza más entre el navegador y tu servidor. Si
  algo falla, cuesta más saber dónde. Por eso esta guía empieza con
  **DNS only**.

## Si lo activas: SSL/TLS en «Full (strict)»

1. En tu dominio, entra a **SSL/TLS → Overview** y elige el modo
   **Full (strict)**.

   > **[Captura 18 — SSL/TLS → Overview con el modo «Full (strict)»]**
   > Archivo sugerido: `img/18-ssl-full-strict.png`

   - **Full (strict):** Cloudflare habla HTTPS con tu VPS y exige un
     certificado válido. Ya lo tienes: el de Let's Encrypt que emitió
     Dokploy.
   - **No uses «Flexible»:** Cloudflare hablaría HTTP con tu VPS y Traefik lo
     redirigiría a HTTPS, lo que produce un bucle de redirecciones
     (`ERR_TOO_MANY_REDIRECTS`).

2. En **DNS → Records**, edita los registros `tienda` y `admin` y activa
   **Proxy status** (nube naranja).

   > **[Captura 19 — Registros tienda y admin en Proxied (nube naranja)]**
   > Archivo sugerido: `img/19-registros-proxied.png`

3. Comprueba que la tienda y el admin siguen abriendo con HTTPS.

Deja `dokploy` en **DNS only**. El panel lo usas solo tú, y así no depende de
Cloudflare.

## Para volver atrás

Apaga el **Proxy status** de los registros (vuelven a **DNS only**). El modo
SSL/TLS solo se aplica al tráfico que pasa por el proxy, así que puede quedar
como está.

---

[← 04. Comprobar que el dominio resuelve](04-comprobar.md) · [Índice](README.md)

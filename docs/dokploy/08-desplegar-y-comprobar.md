# 08. Desplegar y comprobar

[← 07. Configurar los dominios](07-dominios.md) · [Índice](README.md) · [09. Cambiar las contraseñas demo (obligatorio) →](09-contrasenas-demo.md)

---

## Desplegar

1. En la pestaña **General** del Compose `safari`, pulsa **Deploy** y
   confirma.

   > ![Captura — Botón Deploy en la pestaña General](img/08-deploy.png)
   

2. Entra a la pestaña **Deployments**. El despliegue aparece arriba de la
   lista; pulsa **View** para ver su log en vivo.

   > ![Captura — Pestaña Deployments](img/08-deployments-1.png)

   > ![Captura — Pestaña Deployments con el despliegue en curso](img/08-deployments-2.png)


3. El primer arranque tarda unos minutos: baja las cinco imágenes y crea la
   base. El orden es:

   ```text
   postgres (sano) ─▶ db-init (termina) ─▶ api (sana) ─┬─▶ shop  ─┬─▶ proxy
                                                       └─▶ admin ─┘
   ```

   Cada servicio espera a que el anterior esté sano (o, en el caso de
   `db-init`, a que termine bien). `api-lb` arranca en paralelo.

   El despliegue terminó bien cuando el log cierra sin errores y la lista
   marca el despliegue como **Done**.

   > ![Captura — Log del despliegue terminado sin errores](img/08-log-despliegue.png)

## Revisar los contenedores

4. En la pestaña **Containers**, todos deben estar **running**, salvo
   `db-init`, que termina después de preparar la base (**exited**, con
   código 0). Es lo esperado.

   > ![Captura — Pestaña Containers con los servicios running y db-init exited](img/08-containers.png)


5. En la pestaña **Logs**, elige el contenedor `db-init`. En el primer
   despliegue aparece:

   ```text
   db-init: base vacía, seed aplicado
   db-init: esquema al día
   ```

   > ![Captura — Log de db-init con «seed aplicado»](img/08-log-db-init.png)


   En los despliegues siguientes dice
   `la base ya tiene datos …, seed omitido`. Los datos iniciales se cargan
   **solo una vez**, y lo que crees o borres después no se pisa.

6. Espera unos segundos a que Traefik emita los certificados de Let's
   Encrypt.

## Comprobar que funciona

Desde tu equipo:

```bash
# La tienda, el admin y la API (por el proxy). Los tres deben dar 200.
curl -sI https://tienda.<tu-dominio>/en | head -1
curl -sI https://admin.<tu-dominio>/en/login | head -1
curl -s  https://tienda.<tu-dominio>/backend/health/ready

# Qué versión corre: «revision» debe ser el commit completo de IMAGE_TAG.
curl -s https://tienda.<tu-dominio>/backend/health

# El sitemap usa tu dominio real.
curl -s https://tienda.<tu-dominio>/robots.txt | grep -i sitemap
```

> ![Captura — Salida de los curl en la terminal](img/08-curl.png)


Después, en el navegador:

- `https://tienda.<tu-dominio>` muestra productos;

  > ![Captura — La tienda con productos, en su dominio](img/08-tienda.png)
  

- `https://admin.<tu-dominio>` permite entrar con `admin@demo.com` y la
  contraseña demo, que cambias en [09 · Contraseñas demo](09-contrasenas-demo.md);

  > ![Captura — El login del admin, en su dominio](img/08-admin-login.png)
  

- el candado del navegador muestra un certificado válido de Let's Encrypt.

  > ![Captura — Detalle del certificado de Let's Encrypt en el navegador](img/08-certificado.png)
  

Si algo no responde, revisa
[11 · Problemas frecuentes](11-limitaciones-y-problemas.md).

---

[← 07. Configurar los dominios](07-dominios.md) · [Índice](README.md) · [09. Cambiar las contraseñas demo (obligatorio) →](09-contrasenas-demo.md)

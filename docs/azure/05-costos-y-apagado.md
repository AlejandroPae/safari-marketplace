# 05. Costos, apagado y borrado

[← 04. Conectarse por SSH](04-conectarse-por-ssh.md) · [Índice](README.md)

---

La VM consume crédito **por hora mientras está encendida**, y el disco y la
IP pública consumen **aunque la VM esté detenida**. Con USD 100 alcanza para
el curso si no dejas recursos olvidados.

## Ver cuánto crédito queda

- **Saldo de Azure for Students:** https://www.microsoftazuresponsorships.com.
- **Gasto por recurso:** en el portal, **Cost Management → Cost analysis**,
  filtrando por el grupo `rg-safari`.

  > ![Captura — Cost analysis del grupo rg-safari](img/05-cost-analysis.png)

## Detener la VM cuando no la uses

En la VM, pulsa **Stop**. El estado debe pasar a
**Stopped (deallocated)**: así deja de cobrar el cómputo. Si dice solo
**Stopped**, se sigue cobrando.

> ![Captura — VM detenida con el estado «Stopped (deallocated)»](img/05-vm-detenida.png)

- La **IP pública no cambia** al volver a arrancar (es estática), así que el
  DNS y Dokploy siguen funcionando.
- Mientras está detenida, **la tienda y el admin no responden**. Si alguien
  tiene que revisar tu despliegue, déjala encendida.
- Para volver: **Start**. Dokploy y el stack arrancan solos con la VM.

## Borrar todo al terminar el curso

Borra el **grupo de recursos** completo: se lleva la VM, el disco, la IP y la
red de una vez, y no queda nada consumiendo crédito.

1. En el portal, busca **Resource groups** y abre `rg-safari`.
2. Pulsa **Delete resource group**, escribe el nombre `rg-safari` para
   confirmar y pulsa **Delete**.

   > ![Captura — Confirmación de «Delete resource group»](img/05-borrar-grupo.png)

> **Borrar no tiene vuelta atrás:** se pierden la base de datos y todo lo que
> haya en la VM. Si quieres conservar algo, sácalo antes.

---

[← 04. Conectarse por SSH](04-conectarse-por-ssh.md) · [Índice](README.md)

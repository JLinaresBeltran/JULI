const { PromptTemplate } = require("@langchain/core/prompts");

const SERVICIOS_PUBLICOS_PROMPTS = {
   classifyAndPrepareDraft: new PromptTemplate({
       template: `Eres un abogado junior especializado en reclamaciones relacionadas con servicios públicos domiciliarios en Colombia. Tu tarea consiste en analizar la conversación proporcionada y extraer toda la información clave del usuario, redactando un informe preciso y detallado. **No debes mencionar a JULI ni a ningún intermediario en el resumen.**

Analiza la siguiente conversación y realiza estas tareas:
1. Elabora un resumen descriptivo detallado de la conversación en primera persona, como si fueras el cliente presentando su caso. Este resumen debe:
  - Capturar todos los puntos clave de la situación presentada por el usuario.
  - Mantener un orden cronológico de los eventos.
  - Incluir todas las interacciones con la empresa de servicios públicos.
  - Ser lo suficientemente detallado para reflejar la complejidad del caso.
  - Expresar claramente el problema o reclamación desde la perspectiva del cliente.
  - Incluir todos los datos relevantes como fechas, montos, consumos, números de cuenta o radicados.

2. Clasifica el caso en una de estas categorías: Facturación, Calidad del Servicio, Suspensión/Corte, PQR sin respuesta, Otro.

3. Identifica la empresa prestadora del servicio:
  - **Acueducto y Alcantarillado:**
    - EAAB (Razón social: EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTÁ E.S.P.)
    - EPM (Razón social: EMPRESAS PÚBLICAS DE MEDELLÍN E.S.P.)
    - TRIPLE A (Razón social: SOCIEDAD DE ACUEDUCTO, ALCANTARILLADO Y ASEO DE BARRANQUILLA S.A. E.S.P.)
  - **Energía Eléctrica:**
    - ENEL (Razón social: ENEL CODENSA S.A. E.S.P.)
    - CELSIA (Razón social: CELSIA COLOMBIA S.A. E.S.P.)
    - AIR-E (Razón social: AIR-E S.A.S. E.S.P.)
  - **Gas Natural:**
    - VANTI (Razón social: GAS NATURAL S.A. E.S.P.)
    - GASES DEL CARIBE (Razón social: GASES DEL CARIBE S.A. E.S.P.)
    - GASES DE OCCIDENTE (Razón social: GASES DE OCCIDENTE S.A. E.S.P.)

Proporciona tu análisis en el siguiente formato:

RESUMEN DESCRIPTIVO (EN PRIMERA PERSONA):
[Incluye aquí el resumen detallado de la conversación]

CATEGORÍA: [Categoría principal del caso]
Categorías secundarias (si aplica): [Lista de categorías secundarias]

EMPRESA O PROVEEDOR: [Nombre comercial de la empresa (Razón social)]

Conversación: {conversation}`,
       inputVariables: ["conversation"]
   }),

   verifyAndRefine: new PromptTemplate({
       template: `Eres un abogado senior especializado en reclamaciones legales relacionadas con servicios públicos domiciliarios en Colombia. Tu tarea es redactar una reclamación formal basada en el análisis preliminar proporcionado por un abogado junior. El documento debe ser redactado en primera persona desde la perspectiva del cliente, pero con un tono jurídico y profesional. Analiza la información proporcionada a continuación:

{junior_analysis}

Realiza las siguientes tareas:
1. Verifica la precisión de la clasificación y los datos extraídos por el abogado junior.
2. Redacta los HECHOS de manera clara, concisa y jurídicamente relevante:
  - Ordénalos de manera lógica y cronológica.
  - Incluye todos los datos relevantes proporcionados por el junior.
  - Utiliza un lenguaje formal y técnico apropiado para una reclamación legal.
  - Incorpora de manera estratégica expresiones que reflejen la impotencia y malestar del cliente únicamente en los últimos hechos, sin comprometer la profesionalidad del documento.
  - Mantén un balance entre la exposición objetiva de los hechos y la expresión de la experiencia subjetiva del cliente en los ultimos hechos.
3. Formula una PETICIÓN efectiva:
  - Enfócate en los aspectos legalmente relevantes de la situación.
  - Hazla clara, concreta, contundente y bien fundamentada en los hechos presentados.
  - El objeto de la petición debe ser solicitar una solución específica al problema planteado.
  - Utiliza terminología legal apropiada.
  - No incluyas plazos ni términos específicos para la resolución del problema.
4. Crea una REFERENCIA corta y descriptiva para el caso, utilizando la categoria principal, que refleje la naturaleza jurídica de la reclamación.

Proporciona ÚNICAMENTE la siguiente información en el formato especificado:

EMPRESA DE SERVICIOS: [Nombre comercial de la empresa (Razón social)]

REFERENCIA: [Una referencia corta y descriptiva con enfoque jurídico]

HECHOS:
[Enumera los hechos de manera concisa y jurídicamente relevante, incorporando elementos que reflejen el estado emocional del cliente de manera estratégica, sin introducción personal]

PETICIÓN:
[Petición clara, concreta, contundente y fundamentada]

IMPORTANTE: No incluyas ninguna información adicional fuera de estos cuatro elementos. No inicies con presentaciones personales ni incluyas datos del cliente o leyes, que no sean estrictamente necesarios para la reclamación legal.

Datos del cliente: {customer_data}`,
       inputVariables: ["junior_analysis", "customer_data"]
   })
};

module.exports = SERVICIOS_PUBLICOS_PROMPTS;
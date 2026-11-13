/**
 * MIGRACIÓN DE DATOS ENTRE HOJAS DE CÁLCULO  (archivo de un solo uso)
 * ---------------------------------------------------------------------------
 * Copia los datos de la hoja antigua a la hoja actual (la que usa SPREADSHEET_ID
 * en Code.gs) RESPETANDO EL ESQUEMA ACTUAL:
 *
 *   - Empareja las columnas POR NOMBRE, no por posición. La hoja antigua tiene
 *     las mismas columnas de INGRESOS en otro orden, y un "Id" en CONFIG que el
 *     esquema nuevo ya no usa: eso se resuelve solo.
 *   - Las columnas nuevas que no existen en el origen (Video_4..6, FIRMA, FOTO…)
 *     se quedan vacías en vez de desplazar los datos.
 *   - Nunca reescribe las cabeceras de destino, ni borra ni modifica filas: solo
 *     añade las que faltan.
 *   - Es idempotente: cada hoja tiene una clave (DNI, Id, Cod…) y las filas ya
 *     presentes se omiten, así que puedes ejecutarla varias veces sin duplicar.
 *
 * CÓMO USARLA
 *   1. Ejecuta primero  verificarMigracion()   → simulacro, no escribe nada.
 *   2. Revisa el resumen y ejecuta  migrarDesdeHojaAntigua().
 *   3. Cuando termines, puedes borrar este archivo.
 */

/** Hoja de cálculo de ORIGEN (la antigua). El destino es siempre SPREADSHEET_ID. */
var MIGRACION_ORIGEN_ID = '1tKXR0sRb3jZYFrQ8WUVjB3hhIpx1_qbQYfAjJIPPgTA';

/**
 * Hojas a copiar y las columnas que identifican una fila como única.
 * Si una fila no tiene valor en su clave, se usa el contenido completo de la
 * fila como huella, de modo que tampoco se duplique.
 */
var MIGRACION_HOJAS = [
  { nombre: 'LEARN',              claves: ['Id'] },
  { nombre: 'DATA',               claves: ['Cod'] },
  { nombre: 'QUIZ',               claves: ['IdQuiz'] },
  { nombre: 'INGRESOS',           claves: ['DNI'] },
  { nombre: 'CERTIFICADOS',       claves: ['Id'] },
  { nombre: 'SHORT_EVALUACIONES', claves: ['Id'] },
  { nombre: 'SHORT_RESULTADOS',   claves: ['EvaluacionId', 'DNI'] },
  { nombre: 'ACTAS_DOCUMENTOS',   claves: ['Id'] },
  { nombre: 'ACTAS_FIRMAS',       claves: ['Id'] },
  { nombre: 'PAC_PROGRAMAS',      claves: ['Id'] },
  { nombre: 'PAC_PREGUNTAS',      claves: ['IdPregunta'] },
  { nombre: 'PAC_RESULTADOS',     claves: ['Id'] }
];

/** Simulacro: informa qué se copiaría, sin escribir nada. */
function verificarMigracion() {
  return ejecutarMigracion_(true);
}

/** Copia de verdad las filas que falten. */
function migrarDesdeHojaAntigua() {
  return ejecutarMigracion_(false);
}

function ejecutarMigracion_(soloVerificar) {
  var origen = SpreadsheetApp.openById(MIGRACION_ORIGEN_ID);
  var destino = getSpreadsheet_();

  if (origen.getId() === destino.getId()) {
    throw new Error('El origen y el destino son la misma hoja de cálculo. Revisa MIGRACION_ORIGEN_ID y SPREADSHEET_ID.');
  }

  var lineas = [];
  var totalCopiadas = 0;

  MIGRACION_HOJAS.forEach(function (def) {
    var r = migrarHoja_(origen, destino, def.nombre, def.claves, soloVerificar);
    totalCopiadas += r.copiadas;
    lineas.push('• ' + def.nombre + ': ' + r.detalle);
  });

  lineas.push('• CONFIG: ' + migrarConfig_(origen, destino, soloVerificar));

  var titulo = soloVerificar
    ? 'SIMULACRO — no se escribió nada'
    : 'Migración completada';
  var mensaje = titulo + '\n\n' +
    'Origen:  ' + origen.getName() + ' (' + origen.getId() + ')\n' +
    'Destino: ' + destino.getName() + ' (' + destino.getId() + ')\n\n' +
    lineas.join('\n') + '\n\n' +
    (soloVerificar
      ? 'Filas que se copiarían: ' + totalCopiadas + '\nEjecuta migrarDesdeHojaAntigua() para aplicarlo.'
      : 'Filas copiadas: ' + totalCopiadas);

  try { SpreadsheetApp.getUi().alert(titulo, mensaje, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { /* sin interfaz: queda en el registro */ }
  Logger.log(mensaje);

  return { ok: true, copiadas: totalCopiadas, mensaje: mensaje };
}

function migrarHoja_(origen, destino, nombre, claves, soloVerificar) {
  var hojaOrigen = origen.getSheetByName(nombre);
  if (!hojaOrigen) return { copiadas: 0, detalle: 'no existe en la hoja antigua, se omite' };

  var hojaDestino = destino.getSheetByName(nombre);
  if (!hojaDestino) return { copiadas: 0, detalle: 'NO EXISTE EN DESTINO — ejecuta antes "Crear carpetas y hojas"' };

  var datosOrigen = hojaOrigen.getDataRange().getValues();
  if (datosOrigen.length < 2) return { copiadas: 0, detalle: 'sin datos que copiar' };

  var cabOrigen = datosOrigen[0].map(normalizarCabecera_);
  var anchoDestino = Math.max(hojaDestino.getLastColumn(), 1);
  var cabDestino = hojaDestino.getRange(1, 1, 1, anchoDestino).getValues()[0].map(normalizarCabecera_);

  // Posición en el ORIGEN de cada columna del DESTINO (-1 = no existía antes)
  var mapa = cabDestino.map(function (h) { return h ? cabOrigen.indexOf(h) : -1; });
  var sinEquivalencia = cabDestino.filter(function (h, i) { return h && mapa[i] === -1; });

  // Claves ya presentes en el destino, para no duplicar al reejecutar
  var yaExisten = {};
  var filasDestino = hojaDestino.getLastRow() > 1
    ? hojaDestino.getRange(2, 1, hojaDestino.getLastRow() - 1, anchoDestino).getValues()
    : [];
  filasDestino.forEach(function (fila) {
    yaExisten[claveDeFila_(fila, cabDestino, claves)] = true;
  });

  var nuevas = [];
  var omitidas = 0;
  for (var i = 1; i < datosOrigen.length; i++) {
    var filaOrigen = datosOrigen[i];
    if (filaVacia_(filaOrigen)) continue;

    var filaDestino = mapa.map(function (idxOrigen) {
      return idxOrigen === -1 ? '' : (filaOrigen[idxOrigen] !== undefined ? filaOrigen[idxOrigen] : '');
    });

    var clave = claveDeFila_(filaDestino, cabDestino, claves);
    if (yaExisten[clave]) { omitidas++; continue; }
    yaExisten[clave] = true;
    nuevas.push(filaDestino);
  }

  if (nuevas.length > 0 && !soloVerificar) {
    hojaDestino.getRange(hojaDestino.getLastRow() + 1, 1, nuevas.length, anchoDestino).setValues(nuevas);
    SpreadsheetApp.flush();
  }

  var detalle = (soloVerificar ? 'se copiarían ' : 'copiadas ') + nuevas.length + ' fila(s)';
  if (omitidas > 0) detalle += ', ' + omitidas + ' ya estaban';
  if (sinEquivalencia.length > 0) detalle += '; columnas nuevas vacías: ' + sinEquivalencia.join(', ');
  return { copiadas: nuevas.length, detalle: detalle };
}

/**
 * CONFIG es una sola fila. Solo se escribe si el destino sigue con los valores
 * sembrados por defecto (o está vacío): si ya lo configuraste a mano, no se toca.
 */
function migrarConfig_(origen, destino, soloVerificar) {
  var hojaOrigen = origen.getSheetByName('CONFIG');
  var hojaDestino = destino.getSheetByName('CONFIG');
  if (!hojaOrigen || hojaOrigen.getLastRow() < 2) return 'sin datos en la hoja antigua';
  if (!hojaDestino) return 'NO EXISTE EN DESTINO';

  var datosOrigen = hojaOrigen.getDataRange().getValues();
  var cabOrigen = datosOrigen[0].map(normalizarCabecera_);
  var filaOrigen = datosOrigen[1];

  var ancho = Math.max(hojaDestino.getLastColumn(), 1);
  var cabDestino = hojaDestino.getRange(1, 1, 1, ancho).getValues()[0].map(normalizarCabecera_);
  var filaDestino = cabDestino.map(function (h) {
    var idx = h ? cabOrigen.indexOf(h) : -1;
    return idx === -1 ? '' : (filaOrigen[idx] !== undefined ? filaOrigen[idx] : '');
  });

  if (hojaDestino.getLastRow() >= 2) {
    var actual = hojaDestino.getRange(2, 1, 1, ancho).getValues()[0];
    var valor = function (nombre) {
      var i = cabDestino.indexOf(nombre);
      return i === -1 ? '' : String(actual[i] || '').trim();
    };
    var esSemilla = valor('Titulo') === 'Capacitaciones SST' || valor('PassAdmin') === '123456';
    var vacia = actual.every(function (v) { return String(v || '').trim() === ''; });
    if (!esSemilla && !vacia) {
      return 'el destino ya tiene configuración propia, no se tocó (revísala a mano si hace falta)';
    }
  }

  if (!soloVerificar) {
    hojaDestino.getRange(2, 1, 1, ancho).setValues([filaDestino]);
    SpreadsheetApp.flush();
  }
  return soloVerificar ? 'se copiaría la fila de configuración' : 'configuración copiada';
}

function normalizarCabecera_(h) {
  return String(h === null || h === undefined ? '' : h).trim();
}

function filaVacia_(fila) {
  return fila.every(function (v) { return String(v === null || v === undefined ? '' : v).trim() === ''; });
}

/** Clave única de una fila; si no hay valor en las columnas clave, usa la fila entera. */
function claveDeFila_(fila, cabeceras, claves) {
  var partes = claves.map(function (nombre) {
    var i = cabeceras.indexOf(nombre);
    return i === -1 ? '' : String(fila[i] === null || fila[i] === undefined ? '' : fila[i]).trim();
  });
  var tieneValor = partes.some(function (p) { return p !== ''; });
  if (tieneValor) return partes.join('||');
  return 'FILA::' + fila.map(function (v) { return String(v === null || v === undefined ? '' : v).trim(); }).join('|');
}

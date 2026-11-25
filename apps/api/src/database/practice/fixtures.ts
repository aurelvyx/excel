const givenNames = [
  'Valeria Lucía',
  'Diego Alonso',
  'Camila Fernanda',
  'Luis Ángel',
  'María José',
  'Renato Sebastián',
  'Daniela Sofía',
  'Joaquín Mateo',
  'Luciana Paz',
  'Adrián Gabriel',
  'Alejandra Isabel',
  'Andrés Felipe',
  'Rosa Milagros',
  'Carlos Eduardo',
  'Fiorella Andrea',
  'José Manuel',
  'Paola Cristina',
  'Miguel Antonio',
  'Ana Belén',
  'Santiago Nicolás',
  'Elena del Pilar',
  'Bruno Martín',
  'Gabriela Inés',
  'Alonso Javier',
];

const familyNames = [
  'Quispe',
  'Huamán',
  'Vargas',
  'Paredes',
  'Condori',
  'Salazar',
  'Mamani',
  'Rivas',
  'Yupanqui',
  'Cárdenas',
  'Gutiérrez',
  'Núñez',
  'Flores',
  'Choque',
  'Mendoza',
  'Rivera',
  'Cruz',
  'Rojas',
  'Soto',
  'Delgado',
  'Cáceres',
  'Medina',
  'Apaza',
  'Herrera',
];

export const practiceLanguages = [
  {
    code: 'EN',
    name: 'Inglés',
    units: ['Presentaciones y rutinas', 'Conversación cotidiana'],
  },
  {
    code: 'PT',
    name: 'Portugués',
    units: ['Saudações e apresentações', 'Rotina e situações cotidianas'],
  },
];

export const practiceShifts = [
  { code: 'M', name: 'Mañana', horaInicio: '09:00', horaFin: '11:00' },
  { code: 'T', name: 'Tarde', horaInicio: '15:00', horaFin: '17:00' },
  { code: 'N', name: 'Noche', horaInicio: '18:30', horaFin: '20:30' },
];

export function practiceSection(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `A${letter}`;
}

export function practicePerson(
  index: number,
  year: number,
  role: 'estudiante' | 'docente',
  document: string,
) {
  // Combinaciones de nombres comunes generadas sin usar padrones ni contactos.
  const givenIndex = index % givenNames.length;
  const familyOffset = Math.floor(index / givenNames.length);
  const paternalIndex = (givenIndex + familyOffset) % familyNames.length;
  const maternalOffset = Math.floor(familyOffset / familyNames.length);
  const maternalIndex =
    (paternalIndex +
      1 +
      ((givenIndex + maternalOffset) % (familyNames.length - 1))) %
    familyNames.length;
  const age = role === 'docente' ? 28 + (index % 31) : 19 + (index % 29);
  const month = String(1 + (index % 12)).padStart(2, '0');
  const day = String(1 + ((index * 7 + Math.floor(index / 12)) % 28)).padStart(
    2,
    '0',
  );
  return {
    tipoDocumento: 'SINTETICO',
    numeroDocumento: document,
    nombres: givenNames[givenIndex]!,
    apellidoPaterno: familyNames[paternalIndex]!,
    apellidoMaterno: familyNames[maternalIndex]!,
    fechaNacimiento: `${year - age}-${month}-${day}`,
    correo: `${document.toLowerCase()}@example.invalid`,
  };
}

// Mapeo manual para casos especiales
const manualMapping = {
  "Los Prisioneros - pa pa pa": "Los Prisioneros - Pa pa pa (en vivo 2001).clip.mp4",
  "los prisioneros Tren Al Sur": "Los Prisioneros - Tren Al Sur.clip.mp4",
  "Azul Azul - Mamá No Quiero Comer Más Huevo": "Azul Azul - Mamá No Quiero Comer Más Huevo (Vídeo Oficial).clip.mp4",
  "DONDE ESTAN LAS MUJERES QUE NO TIENEN MARIDO - JUAN CABAÑAS MX (GUARACHA)": "DONDE ESTAN LAS MUJERES QUE NO TIENEN MARIDO - JUAN CABAÑAS MX (GUARACHA) #guaracha #JuanCabañasMx.clip.mp4",
  "Los Del Rio - Macarena (Bayside Boys Remix)": "MACARENA ORIGINAL MUSIC DANCE 1990 Los del Río  'Macarena'.clip.mp4",
  "GABY - EL MENEAITO SONIDO REMIX X [ DJ PEDRO VALLEJO)": "Gaby - Meneaito (Official Music Video).clip.mp4",
  "Carrapicho - Tic, tic tac Video Oficial HD": null, // No encontrado
  "Ricardo Montaner Vamos Pa La Conga (Remix)": "Ricardo Montaner - Vamos Pa´ La Conga  (Remasterizado).clip.mp4",
  "José Luis Rodríguez - Agárrense de las Manos": "José Luis Rodríguez - Agárrense de las Manos.clip.mp4",
  "Danza Kuduro Remix - Don Omar Ft Daddy Yankee y Arcangel.wmv": "Don Omar - Danza Kuduro ft. Lucenzo.clip.mp4",
  "Village People - Y.M.C.A. (David Kust Video Remix) (Vj Partyman Croatia)": "Village People - YMCA (OFFICIAL Music Video 1978).clip.mp4",
  "El Alfa \"El Jefe\" x Nfasis - ESTE (Video Oficial)": null, // No encontrado
  "Rawayana, Akapellah - Veneka (Official Video)": "Rawayana, Akapellah - Veneka (Official Video).clip.mp4",
  "Molotov - Puto": "Molotov - Puto.clip.mp4",
  "Soda Stereo - De Música Ligera (Official Video)": "Soda Stereo - De Musica Ligera (El Último Concierto).clip.mp4",
  "Pedro Fernández - Yo No Fui": "Pedro Fernández - Yo No Fui.clip.mp4",
  "Melody - El Baile del Gorila (Videoclip)": "El Baile del Gorila (Videoclip).clip.mp4",
  "El Alfa \"El Jefe\" x CJ x El Cherry Scom - La Mamá de la Mamá (Video Oficial)": null, // No encontrado
  "Mach & Daddy — La Botella [Letra]": "Mach & Daddy   Pásame La Botella  4k 60fps.clip.mp4",
  "Daddy Yankee - Limbo (Video Oficial)": null, // No encontrado
  "Wilfrido Vargas El Baile del Perrito Video Clip Oficial": "Wilfrido Vargas - El Baile Del Perrito HD Nitro Vdj.clip.mp4",
  "Va colgando de un Hilito (Guayabo Tech )": "Guayabo Zarandiao ｜ Emily Galaviz ｜ SUBTITULADO.clip.mp4",
  "A las Mujeres se les da! Tambor Urbano video oficial": "Tambor Urbano  Remix Tambores I Son De MI Tierra  Primera Temporada.clip.mp4",
  "leo leo lee tambor urbano Original": "Tambor Urbano  Remix Tambores I Son De MI Tierra  Primera Temporada.clip.mp4",
  "Sopa de caracol - banda blanca - video rmx - Dj Fredy Pro !!": "Sopa de caracol - banda blanca - video rmx - Dj Fredy Pro !!.clip.mp4",
  "Aserejé (The Ketchup Song) [Spanish Version] - Las Ketchup": null, // No encontrado
  "El General - Rica y Apretadita (Dj Mp3 Remix)": "Rica y apretadita - El General (Letra HD) ⧸ No me trates de engañar hmm.clip.mp4",
  "Kaoma - Lambada (Official Video) 1989 HD": "Kaoma - Lambada (Official Video) 1989 HD.clip.mp4",
  "Celia Cruz - La Negra Tiene Tumbao (Official Video)": "Celia Cruz - La Negra Tiene Tumbao (Official Video).clip.mp4",
  "Gente de Zona - La Gozadera (Official Video) ft. Marc Anthony": "Gente de Zona - La Gozadera (Official Video) ft. Marc Anthony.clip.mp4",
  "Michel Teló - Ai Se Eu Te Pego - Video Oficial (Assim você me mata)": "Michel Teló - Ai Se Eu Te Pego -  Video Oficial (Assim você me mata).clip.mp4",
  "gustavo lima che chere re che che (RICK MUSICK)": "Gusttavo Lima - Balada (Tchê Tchê Rere) [DVD Gusttavo Lima e Você - Ao Vivo].clip.mp4",
  "Mayonesa - Chocolate (Video Oficial)": null, // No encontrado
  "Daddy Yankee - La Despedida": "Daddy Yankee - La Despedida.clip.mp4",
  "Azul Azul - La Bomba - Perreito Remix": null, // No encontrado
  "Xuxa ilarie (Videoclip) en español": "Xuxa ilarie (Videoclip) en español.clip.mp4",
  "Que viva la Vinotinto": "Que Viva la Vinotinto 2015 Comercial Oficial de la selección Venezolana de Fútbol.clip.mp4",
  "La Cucaracha": null, // No encontrado
  "Leones del Caracas - ♪ León, León, León, León ♪ Remix (Official Music Video": null, // No encontrado
  "Magallanes Será Campeón ・ Billo's Caracas Boys": null, // No encontrado
  "Tiburones De La Guaira - SAMBA": "Tiburones De La Guaira - SAMBA.clip.mp4",
  "Batucada Samba de Río I I": null, // No encontrado
  "Melô Do Tchaco II (Dança Gostosa).": "Melô Do Tchaco II (Dança Gostosa).clip.mp4",
  "Sergio Mendes - Magalenha (Official Visualizer)": "Sergio Mendes - Magalenha (Video Original).clip.mp4",
  "Devuélveme a mi chica (hombre g)": "Sufre mamón, devuélveme a mi chica - Hombres G (Videoclip).clip.mp4",
  "Tequila (the champs)": "Tequila.clip.mp4"
};

// Agregar archivos que están en la carpeta pero no en el playlist
const additionalFiles = [
  "Ai Se Eu Te Pego.clip.mp4",
  "Arenita Playita- CuartoPoder.clip.mp4",
  "Bandolero (Pop) (Video Oficial) - Olga Tañón.clip.mp4",
  "Caramelos de Cianuro - La Casa ᴴᴰ.clip.mp4",
  "Carlos Vives - Como Le Gusta a Tu Cuerpo ft. Michel Teló.clip.mp4",
  "Daddy Yankee - Gasolina (Video Oficial).clip.mp4",
  "Danny Ocean - Crayola (VISUALIZER).clip.mp4",
  "Diavolo   Liz & Los Melodicos avi   YouTube.clip.mp4",
  "Don Omar ｜ Dile (Video Oficial ).clip.mp4",
  "Don Omar - Salio El Sol.clip.mp4",
  "Gochilandia Park.clip.mp4",
  "GRUPO NICHE UNA AVENTURA ( VIDEO OFICIAL).clip.mp4",
  "Guaco - Pídeme ｜ Álbum El Sonido De Venezuela.clip.mp4",
  "Juan Luis Guerra 4.40 - La Bilirrubina (Live).clip.mp4",
  "Juan Luis Guerra 4.40 - Las Avispas (Live).clip.mp4",
  "Juan Magán - Bailando por Ahi (Videoclip).clip.mp4",
  "La Beriso - Imaginate (Sinfónico en Vivo) (Letra).clip.mp4",
  "La Casa del Ritmo.clip.mp4",
  "Liz - A Dormir Juntitos (Official Music Video) ft. Eddy Herrera.clip.mp4",
  "Mermelada Bunch - Me Liberé [video oficial].clip.mp4",
  "Molotov - Gimme Tha Power ( Video Original ) HQ.clip.mp4",
  "Olga Tañón - Es Mentiroso (Nueva Versión 2022).clip.mp4",
  "OLGA TAÑON MUCHACHO MALO.clip.mp4",
  "Pitbull - Give Me Everything ft. Ne-Yo, Afrojack, Nayer.clip.mp4",
  "Proyecto1 - Otra Noche.clip.mp4",
  "PURO DEDESO DE AMAR -  (Video Oficial) - Daiquiri.clip.mp4",
  "Raffaella Carrà - Pedro (español) [Video Musical Restaurado] - Millemilioni Buenos Aires, 1980.clip.mp4",
  "Ricky Martin - La Bomba (Official Spanish Version).clip.mp4",
  "Rubby Pérez - Cuando estés con él.clip.mp4",
  "Rubby Pérez - Enamorado De Ella (Con Letra).clip.mp4",
  "Rubby Pérez - Hazme olvidarla (Lyrics Video).clip.mp4",
  "Sandy & Papo  ♣   Es Hora de Bailar  (Vídeo Oficial).clip.mp4",
  "Sandy & Papo - Huelepega (Video Oficial).clip.mp4",
  "Sandy y Papo - Mueve, Mueve - Festival de Viña del Mar 1999.clip.mp4",
  "SESSION EL SENSEI EN VIVO POR PITI FERNÁNDEZ.clip.mp4",
  "Shakira - Hips Don't Lie (featuring Wyclef Jean) (Official 4K Video) ft. Wyclef Jean.clip.mp4",
  "Wilfrido Vargas feat. Rubby Pérez - Volveré.clip.mp4",
  "Willie Colon feat. Hector Lavoe - La Murga.clip.mp4"
];

console.log('Manual mapping created successfully!');
console.log('Files mapped:', Object.keys(manualMapping).length);
console.log('Additional files found:', additionalFiles.length);

# 🧪 Estudo Científico: Datasets Públicos de Expressões & Landmarks Faciais

Este documento reúne uma análise aprofundada dos principais conjuntos de dados científicos públicos utilizados em pesquisas acadêmicas e de inteligência artificial para o reconhecimento de expressões faciais a partir de marcos geométricos (**landmarks**).

---

## 📸 Os 3 Pilares dos Datasets de Expressão Facial

### 1. CK+ (Extended Cohn-Kanade Dataset)
* **Descrição**: O CK+ é o padrão de ouro clássico para sistemas geométricos e comportamentais. Ele fornece sequências que começam em uma expressão **neutra** e progridem até o **pico da expressão facial** (onde a emoção atinge a intensidade máxima).
* **Marcos Faciais**: Tradicionalmente anotado com **68 pontos faciais** (padrão Dlib/AAM), cobrindo sobrancelhas, olhos, nariz, boca e linha da mandíbula.
* **Foco Científico**: Totalmente baseado no **FACS (Facial Action Coding System)** desenvolvido por Paul Ekman e Wallace V. Friesen. Cada sequência de expressão contém rótulos de Unidades de Ação (AUs), permitindo quantificar micro-expressões exatas (ex: AU12 para o elevador do canto labial no sorriso).

### 2. JAFFE (Japanese Female Facial Expression)
* **Descrição**: Contém 213 imagens em escala de cinza de 10 modelos femininas japonesas. Cada imagem foi avaliada por dezenas de voluntários humanos para atribuir pontuações de intensidade às 6 emoções básicas mais a neutra.
* **Foco Científico**: Extremamente útil para calibrar modelos que buscam independência étnica e estudar a percepção transcultural de emoções. É muito utilizado como benchmark de validação cruzada para testes de sobreajuste (overfitting).

### 3. FER2013 (Facial Expression Recognition 2013)
* **Descrição**: Um dataset muito maior, criado pelo Google, que consiste em **35.887 imagens** de 48x48 pixels em escala de cinza obtidas por web scrapers públicos. As imagens sofrem com oclusões, rotações e ruído de iluminação (imagens do mundo real).
* **Foco Científico**: Ao contrário do CK+, as imagens do FER2013 não trazem marcos faciais (landmarks) salvos nativamente de fábrica. Em vez disso, pesquisadores costumam rodar modelos de rede neural secundários (como Dlib, MTCNN ou MediaPipe FaceMesh) sobre o FER2013 para extrair as coordenadas dos marcos e então realizar tarefas de aprendizado supervisionado geométrico.

---

## 🧮 Mapeamento de Marcos Faciais: Dlib (68) vs. MediaPipe FaceMesh (468)

Muitos datasets clássicos (como CK+) foram rotulados no padrão clássico de **68 pontos (Dlib)**. No entanto, soluções modernas em tempo real como o **MediaPipe FaceMesh** geram uma malha densa de **468 pontos** (ou 478 com a íris). Abaixo está a correlação direta de índices utilizada para computar as equações científicas de expressões:

| Região Facial | Índices Dlib (68) | Índices correspondentes FaceMesh (468) | Importância FACS / Emoção |
| :--- | :--- | :--- | :--- |
| **Canto do Olho Esquerdo (Ext)** | 37 | 33 | Ponto de ancoragem lateral para rotação e escala |
| **Canto do Olho Direito (Ext)** | 46 | 263 | Ponto de ancoragem lateral para rotação e escala |
| **Olho Esquerdo (Abertura)** | 38, 41 | 159 (Topo), 145 (Base) | Abertura ocular para surpresa, pânico ou fadiga |
| **Olho Direito (Abertura)** | 44, 47 | 386 (Topo), 374 (Base) | Abertura ocular para surpresa, pânico ou fadiga |
| **Sobrancelha Esquerda (Int)** | 22 | 70 | Franzir de testa para raiva, preocupação ou foco |
| **Sobrancelha Direita (Int)** | 23 | 300 | Franzir de testa para raiva, preocupação ou foco |
| **Canto Labial Esquerdo** | 49 | 61 | Elevação para sorriso (Happy), depressão para choro (Sad) |
| **Canto Labial Direito** | 55 | 291 | Elevação para sorriso (Happy), depressão para choro (Sad) |
| **Lábio Superior (Centro)** | 52 | 13 | Abertura bucal vertical, vocalização |
| **Lábio Inferior (Centro)** | 58 | 14 | Abertura bucal vertical, vocalização |

---

## 📐 Fórmulas Normativas de Normalização 3D

Para garantir que o reconhecimento seja imune a quão longe ou perto o usuário está da câmera, ou a rotações suaves da cabeça, o nosso sistema adota a **Normalização Relativa à Largura Facial Interocular**.

As coordenadas $P = (x, y, z)$ são extraídas diretamente em 3 dimensões da FaceMesh do MediaPipe.

### 1. Cálculo da Distância Euclidiana 3D
A distância real no espaço 3D entre dois marcos faciais $A = (x_a, y_a, z_a)$ e $B = (x_b, y_b, z_b)$ é computada como:

$$d(A, B) = \sqrt{(x_b - x_a)^2 + (y_b - y_a)^2 + (z_b - z_a)^2}$$

### 2. Distância Interocular de Referência ($Ref$)
Usamos a distância entre os cantos externos dos olhos como normalizador constante:

$$Ref = d(Landmark_{33}, Landmark_{263})$$

### 3. Abertura Ocular Média Normalizada ($EyeOpenness$)
Calculada como a média da distância vertical entre o topo e a base das pálpebras, normalizada por $Ref$:

$$EyeOpenness = \frac{d(159, 145) + d(386, 374)}{2 \times Ref}$$

* **Comportamento Clínico (CK+)**:
  * *Neutro/Repouso*: $\approx 0.040 - 0.050$
  * *Arregalado (Surpresa)*: $> 0.065$
  * *Fechado/Piscando*: $< 0.020$

### 4. Métrica do Sorriso Normalizada ($SmileMetric$)
Computa a diferença média de altura vertical $y$ entre o centro do lábio superior (`13`) e os cantos da boca (`61`, `291`), normalizada por $Ref$. Como o eixo $y$ na tela é invertido (o topo é zero), a subida dos cantos (sorriso) aumenta o valor:

$$SmileMetric = \frac{(y_{13} - y_{61}) + (y_{13} - y_{291})}{2 \times Ref}$$

* **Comportamento Clínico (CK+)**:
  * *Neutro/Repouso*: $\approx -0.010 \text{ a } 0.010$
  * *Sorrindo (Happy)*: $> 0.040$ (cantos sobem fortemente)
  * *Triste (Sad)*: $< -0.035$ (cantos caem fortemente)

### 5. Altura da Boca Normalizada ($MouthHeight$)
Mede a abertura vertical da cavidade oral:

$$MouthHeight = \frac{d(13, 14)}{Ref}$$

* **Comportamento Clínico (CK+)**:
  * *Neutro/Repouso*: $\approx 0.020 - 0.035$
  * *Aberto (Surpresa)*: $> 0.090$

---

## 🔬 Calibração Dinâmica

O uso dessas equações matemáticas limpas e normalizadas no **Camera Games** permite que o algoritmo se adapte perfeitamente a crianças e adultos, independentemente do formato físico do rosto ou do ângulo relativo da câmera, representando o estado da arte em calibração baseada em visão computacional pura.

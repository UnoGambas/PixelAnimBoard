// --- 1. 전역 변수 선언 ---

// 캔버스 설정
let canvasSize = 32;
let pixelSize;
let animationData; // [프레임][열][행]
let gridHeight; // 메인 그리드(캔버스)의 높이
let filmstripHeight = 74; // 74px 높이의 필름 스트립 영역

// 애니메이션 설정
const MAX_FRAMES = 24;
let currentFrame = 0;
let previewFrame = 0;
let fps = 8;
let lastFrameTime = 0;
let previewCanvas;

// 썸네일 전용 그래픽 버퍼 (DOM에 추가 안 함)
let thumbnailGraphics = []; 

// 도구 상태
let currentTool = 'pencil';
let currentColor;
let isDrawing = false;
let startCol, startRow, lastCol, lastRow;

// UI 요소
let btnPencil, btnRect, btnBlack, btnWhite;
let btnSaveSheet, inputFileName;
let inputLoadSheet; // '불러오기' 기능
let btnPrevFrame, btnNextFrame;
let labelFrame, sliderFPS, labelFPS;

// 💡 '페이지' 버튼 및 오프셋
let btnPagePrev, btnPageNext;
let frameOffset = 0; // 필름 스트립의 시작 프레임 인덱스
let thumbsPerPage = 0; // 한 페이지에 보이는 썸네일 개수 (자동 계산)

// 사운드 변수
let do1Sound, dragSound;
let lastSnapW = null, lastSnapH = null;

// 💡 스크롤 변수 모두 제거


// --- 2. p5.js 핵심 함수 ---

function preload() {
    try {
        do1Sound = loadSound('audio/Do1.mp3');
        dragSound = loadSound('audio/Do1.mp3');
    } catch (e) { console.warn("오디오 파일을 로드할 수 없습니다.", e); }
}

function setup() {
    // 캔버스 크기 설정 (그리드 + 필름 스트립)
    gridHeight = min(windowWidth, windowHeight) * 0.7; // 메인 그리드 크기
    pixelSize = gridHeight / canvasSize;
    
    createCanvas(gridHeight, gridHeight + filmstripHeight);

    if (do1Sound) do1Sound.setVolume(0.5);
    if (dragSound) dragSound.setVolume(0.5);

    // 애니메이션 데이터 초기화
    let white = color(255);
    animationData = Array(MAX_FRAMES).fill(null).map(() =>
        Array(canvasSize).fill(null).map(() =>
            Array(canvasSize).fill(white)
        )
    );
    currentColor = color(0);

    // 미리보기 캔버스 생성
    previewCanvas = createGraphics(128, 128);
    previewCanvas.noSmooth();
    
    // 썸네일 그래픽 버퍼 24개 생성 (데이터 전용)
    for (let i = 0; i < MAX_FRAMES; i++) {
        let gfx = createGraphics(canvasSize, canvasSize);
        gfx.noSmooth();
        gfx.background(255); // 흰색으로 초기화
        thumbnailGraphics.push(gfx);
    }
    
    // --- UI 생성 (단순 위치 지정) ---
    let yPos = height + 10; 

    // 도구 (우측 정렬 느낌)
    btnPencil = createButton('✏️ 연필');
    btnRect = createButton('⬜ 사각형');
    btnPencil.position(width - 130, yPos);
    btnRect.position(width - 70, yPos);
    btnPencil.mousePressed(() => { currentTool = 'pencil'; updateUI(); });
    btnRect.mousePressed(() => { currentTool = 'rectangle'; updateUI(); });

    // 색상 (우측 정렬 느낌)
    btnBlack = createButton('⬛ 검은색');
    btnWhite = createButton('⬜ 흰색 (지우개)');
    btnBlack.position(width - 160, yPos + 30);
    btnWhite.position(width - 90, yPos + 30);
    btnBlack.mousePressed(() => { currentColor = color(0); updateUI(); });
    btnWhite.mousePressed(() => { currentColor = color(255); updateUI(); });

    // 프레임 컨트롤 (좌측)
    yPos = height + 10;
    
    // 💡 페이지 넘기기 버튼
    btnPagePrev = createButton('<<');
    btnPagePrev.position(10, yPos);
    btnPagePrev.mousePressed(goPrevPage);
    
    btnPrevFrame = createButton('◀');
    btnPrevFrame.position(btnPagePrev.x + btnPagePrev.width + 5, yPos);
    btnPrevFrame.mousePressed(goPrevFrame);

    labelFrame = createP(`Frame: ${currentFrame + 1} / ${MAX_FRAMES}`);
    labelFrame.position(btnPrevFrame.x + btnPrevFrame.width + 10, yPos - 16);

    btnNextFrame = createButton('▶');
    btnNextFrame.position(btnPrevFrame.x + btnPrevFrame.width + 90, yPos);
    btnNextFrame.mousePressed(goNextFrame);
    
    btnPageNext = createButton('>>');
    btnPageNext.position(btnNextFrame.x + btnNextFrame.width + 5, yPos);
    btnPageNext.mousePressed(goNextPage);

    // FPS (좌측)
    yPos += 40;
    labelFPS = createP('FPS: 8');
    labelFPS.position(10, yPos - 16);
    sliderFPS = createSlider(1, 24, fps, 1);
    sliderFPS.position(60, yPos);
    sliderFPS.style('width', '80px');
    sliderFPS.input(() => { 
        fps = sliderFPS.value(); 
        labelFPS.html(`FPS: ${fps}`);
    });
    
    // 저장 (좌측)
    yPos += 40;
    inputFileName = createInput('sprite-sheet.png');
    inputFileName.position(10, yPos);
    inputFileName.size(140);
    btnSaveSheet = createButton('Save Sheet');
    btnSaveSheet.position(inputFileName.x + inputFileName.width + 10, yPos);
    btnSaveSheet.mousePressed(saveSpriteSheet);
    
    // 불러오기 (좌측)
    inputLoadSheet = createFileInput(handleFileLoad);
    inputLoadSheet.position(btnSaveSheet.x + btnSaveSheet.width + 10, yPos);

    // 💡 썸네일 개수 초기 계산
    calculateThumbsPerPage();
    
    updateUI(); // 버튼 활성 상태 초기화
    renderPreview(currentFrame); // 미리보기 창 초기화
    updateAllThumbnails(); // 썸네일 초기 렌더링
}


function draw() {
    background(120); // 캔버스 바깥쪽 회색

    // 1. 픽셀 캔버스(그리드) 그리기 (상단 영역)
    drawPixelGrid(currentFrame); 
    
    // 2. 필름 스트립 그리기 (하단 영역)
    drawFilmstrip();

    // 3. 애니메이션 미리보기 처리 (우측 상단)
    handlePlayback();
    image(previewCanvas, gridHeight - 138, 10); 
    noFill();
    stroke(255);
    rect(gridHeight - 138, 10, 128, 128);

    // 4. 호버/드래그 미리보기 (그리드 위)
    drawPreview();
}


// --- 3. 마우스 입력 함수 ---

function mousePressed() {
    // 클릭한 위치가 그리드인지 필름 스트립인지 확인
    if (mouseY > gridHeight && mouseY < gridHeight + filmstripHeight) {
        // 필름 스트립을 클릭함
        handleClickOnFilmstrip();
        return; // 그리기에 그리지 않음
    }
    
    // 그리드 영역 클릭
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > gridHeight) {
        return; 
    }
    
    isDrawing = true;
    let { col, row } = mouseToGridCoords(mouseX, mouseY);
    if (col === null) return;
    startCol = col;
    startRow = row;

    if (currentTool === 'pencil') {
        drawPixel(currentFrame, col, row, currentColor);
        lastCol = col;
        lastRow = row;
    }
}

function mouseDragged() {
    if (!isDrawing || mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > gridHeight) return;
    
    let { col, row } = mouseToGridCoords(mouseX, mouseY);
    if (col === null) return;

    if (currentTool === 'pencil') {
        if (col !== lastCol || row !== lastRow) {
            drawLine(currentFrame, lastCol, lastRow, col, row, currentColor);
            lastCol = col;
            lastRow = row;
        }
    } else if (currentTool === 'rectangle') {
        // (사운드 로직 동일)
        let w = Math.abs(col - startCol) + 1;
        let h = Math.abs(row - startRow) + 1;
        if (dragSound && dragSound.isLoaded() && (w !== lastSnapW || h !== lastSnapH)) {
            let area = Math.max(1, w * h);
            let maxArea = canvasSize * canvasSize;
            let norm = Math.log(area) / Math.log(maxArea);
            norm = constrain(norm, 0, 1);
            let pitch = lerp(0.5, 2.0, norm);
            dragSound.rate(pitch);
            dragSound.play();
            lastSnapW = w;
            lastSnapH = h;
        }
    }
}

function mouseReleased() {
    if (!isDrawing) return;
    isDrawing = false;
    
    let { col, row } = mouseToGridCoords(mouseX, mouseY);
    if (col === null) {
        col = constrain(floor(mouseX / pixelSize), 0, canvasSize - 1);
        row = constrain(floor(mouseY / pixelSize), 0, canvasSize - 1);
    }
    
    if (currentTool === 'rectangle') {
        drawRectangle(currentFrame, startCol, startRow, col, row, currentColor);
    }
    
    lastSnapW = null;
    lastSnapH = null;

    // [성능 최적화] 마우스를 뗐을 때 썸네일 1번만 업데이트
    updateThumbnail(currentFrame);
}

function windowResized() {
    gridHeight = min(windowWidth, windowHeight) * 0.7;
    pixelSize = gridHeight / canvasSize;
    resizeCanvas(gridHeight, gridHeight + filmstripHeight);

    // 💡 썸네일 개수 다시 계산
    calculateThumbsPerPage();

    // UI 위치 재조정
    let yPos = height + 10;
    btnPencil.position(width - 130, yPos);
    btnRect.position(width - 70, yPos);
    btnBlack.position(width - 160, yPos + 30);
    btnWhite.position(width - 90, yPos + 30);
    yPos = height + 10;
    btnPagePrev.position(10, yPos);
    btnPrevFrame.position(btnPagePrev.x + btnPagePrev.width + 5, yPos);
    labelFrame.position(btnPrevFrame.x + btnPrevFrame.width + 10, yPos - 16);
    btnNextFrame.position(btnPrevFrame.x + btnPrevFrame.width + 90, yPos);
    btnPageNext.position(btnNextFrame.x + btnNextFrame.width + 5, yPos);
    yPos += 40;
    labelFPS.position(10, yPos - 16);
    sliderFPS.position(60, yPos);
    yPos += 40;
    inputFileName.position(10, yPos);
    btnSaveSheet.position(inputFileName.x + inputFileName.width + 10, yPos);
    inputLoadSheet.position(btnSaveSheet.x + btnSaveSheet.width + 10, yPos);
    
    // 💡 스크롤 관련 로직 제거
}


// --- 4. 애니메이션/저장 헬퍼 ---

/** 💡 메인 캔버스 하단에 필름 스트립을 그립니다. (페이지 방식) */
function drawFilmstrip() {
    let thumbSize = 64;
    let thumbY = gridHeight + 5; // 캔버스 상단 + 5px 패딩
    let thumbPadding = 5;
    
    // 배경
    fill(51); // #333
    noStroke();
    rect(0, gridHeight, width, filmstripHeight);
    
    // 썸네일 그리기
    push(); // 그리기 설정 저장
    
    if (drawingContext) {
        drawingContext.imageSmoothingEnabled = false;
    }

    // 💡 현재 페이지에 보이는 썸네일만 그리기
    for (let i = 0; i < thumbsPerPage; i++) {
        let frameIndex = frameOffset + i;
        
        // 24 프레임을 넘어가면 그리기 중단
        if (frameIndex >= MAX_FRAMES) {
            break;
        }

        // X좌표 계산 (i 기준)
        let thumbX = thumbPadding + i * (thumbSize + thumbPadding);

        // 미리 그려둔 썸네일 그래픽 버퍼를 image()로 그리기
        image(thumbnailGraphics[frameIndex], thumbX, thumbY, thumbSize, thumbSize);
        
        // 테두리
        if (frameIndex === currentFrame) {
            stroke('#3399FF'); // 파란색
            strokeWeight(2);
        } else {
            stroke('#888'); // 회색
            strokeWeight(1);
        }
        noFill();
        rect(thumbX, thumbY, thumbSize, thumbSize);
    }
    
    pop(); // 그리기 설정 복원
}

/** 💡 필름 스트립 클릭 시 프레임 이동 (페이지 방식) */
function handleClickOnFilmstrip() {
    let thumbSize = 64;
    let thumbPadding = 5;
    let thumbY = gridHeight + 5;

    for (let i = 0; i < thumbsPerPage; i++) {
        let frameIndex = frameOffset + i;
        
        if (frameIndex >= MAX_FRAMES) {
            break;
        }

        let thumbX = thumbPadding + i * (thumbSize + thumbPadding);
        
        // 클릭이 이 썸네일 영역 안에 있는지 확인
        if (mouseX > thumbX && mouseX < thumbX + thumbSize &&
            mouseY > thumbY && mouseY < thumbY + thumbSize) {
            
            jumpToFrame(frameIndex);
            break; // 프레임 찾았으면 루프 종료
        }
    }
}

// (saveSpriteSheet, handlePlayback, renderPreview, sanitizeFileName 함수는 동일하게 유지)
function saveSpriteSheet() {
    const scale = 1;
    const outWidth = canvasSize * MAX_FRAMES;
    const outHeight = canvasSize;
    const off = document.createElement('canvas');
    off.width = outWidth;
    off.height = outHeight;
    const ctx = off.getContext('2d');
    function p5ColorToRGBA(p5Color) {
        return `rgba(${red(p5Color)}, ${green(p5Color)}, ${blue(p5Color)}, ${alpha(p5Color) / 255})`;
    }
    for (let f = 0; f < MAX_FRAMES; f++) {
        for (let c = 0; c < canvasSize; c++) {
            for (let r = 0; r < canvasSize; r++) {
                const color = animationData[f][c][r];
                ctx.fillStyle = p5ColorToRGBA(color);
                let x = (f * canvasSize) + c;
                let y = r;
                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    }
    let desiredName = inputFileName.value().trim() || 'sprite-sheet.png';
    desiredName = sanitizeFileName(desiredName);
    off.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = desiredName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png');
}
function handlePlayback() {
    let now = millis();
    let timePerFrame = 1000 / fps;
    if (now - lastFrameTime > timePerFrame) {
        previewFrame = (previewFrame + 1) % MAX_FRAMES;
        renderPreview(previewFrame);
        lastFrameTime = now;
    }
}
function renderPreview(frameIndex) {
    let frameData = animationData[frameIndex];
    let previewPixelSize = previewCanvas.width / canvasSize;
    previewCanvas.background(255);
    previewCanvas.noStroke();
    for (let c = 0; c < canvasSize; c++) {
        for (let r = 0; r < canvasSize; r++) {
            previewCanvas.fill(frameData[c][r]);
            previewCanvas.rect(c * previewPixelSize, r * previewPixelSize, previewPixelSize, previewPixelSize);
        }
    }
}
function sanitizeFileName(name) {
    let ext = '';
    const lastDot = name.lastIndexOf('.');
    if (lastDot !== -1) {
        ext = name.slice(lastDot + 1).toLowerCase();
        name = name.slice(0, lastDot);
    }
    name = name.replace(/[\\/:*?"<>|]+/g, '');
    name = name.replace(/\s+/g, '-');
    if (!ext) ext = 'png';
    if (ext !== 'png') ext = 'png';
    return `${name}.${ext}`;
}

/** 다음 프레임으로 이동 */
function goNextFrame() {
    currentFrame = (currentFrame + 1) % MAX_FRAMES;
    updateUI();
    ensureFrameVisible(currentFrame); // 💡 페이지 자동 넘김
}

/** 이전 프레임으로 이동 */
function goPrevFrame() {
    currentFrame = (currentFrame - 1 + MAX_FRAMES) % MAX_FRAMES;
    updateUI();
    ensureFrameVisible(currentFrame); // 💡 페이지 자동 넘김
}

/** 💡 다음 '페이지'로 이동 */
function goNextPage() {
    frameOffset += thumbsPerPage;
    // 24개 프레임 내에서 최대 오프셋 제한
    frameOffset = min(frameOffset, MAX_FRAMES - thumbsPerPage);
    frameOffset = max(0, frameOffset); // 0 미만 방지
}

/** 💡 이전 '페이지'로 이동 */
function goPrevPage() {
    frameOffset -= thumbsPerPage;
    frameOffset = max(0, frameOffset); // 0 미만 방지
}

/** 💡 현재 프레임이 보이도록 페이지를 조정 */
function ensureFrameVisible(frameIndex) {
    if (frameIndex < frameOffset) {
        // 현재 프레임이 페이지 왼쪽에 있으면 (예: 5 < 8)
        frameOffset = floor(frameIndex / thumbsPerPage) * thumbsPerPage;
    } else if (frameIndex >= frameOffset + thumbsPerPage) {
        // 현재 프레임이 페이지 오른쪽에 있으면 (예: 17 >= 8 + 8)
        frameOffset = floor(frameIndex / thumbsPerPage) * thumbsPerPage;
    }
    // 이미 보이고 있으면 아무것도 안 함
}

/** 필름 스트립 클릭 시 특정 프레임으로 점프 */
function jumpToFrame(frameIndex) {
    if (frameIndex < 0 || frameIndex >= MAX_FRAMES) return;
    currentFrame = frameIndex;
    updateUI();
    // 💡 중앙 정렬 대신 '페이지 확인' 로직으로 변경
    ensureFrameVisible(currentFrame); 
}

// 💡 centerThumbnail() 함수 제거

/** 썸네일 그래픽 버퍼 1개를 다시 그립니다. */
function updateThumbnail(frameIndex) {
    if (frameIndex < 0 || frameIndex >= thumbnailGraphics.length) return;
    
    let gfx = thumbnailGraphics[frameIndex];
    let frameData = animationData[frameIndex];
    
    gfx.background(255);
    gfx.noStroke();
    
    for (let c = 0; c < canvasSize; c++) {
        for (let r = 0; r < canvasSize; r++) {
            gfx.fill(frameData[c][r]);
            gfx.rect(c, r, 1, 1);
        }
    }
}

/** 모든 썸네일 캔버스를 다시 그리는 헬퍼 함수 */
function updateAllThumbnails() {
    for (let i = 0; i < MAX_FRAMES; i++) {
        updateThumbnail(i);
    }
}


// --- 5. 그리기 헬퍼 함수 ---

function drawPixelGrid(frameIndex) {
    let frameData = animationData[frameIndex];
    
    push();
    translate(0, 0);
    
    noStroke();
    for (let c = 0; c < canvasSize; c++) {
        for (let r = 0; r < canvasSize; r++) {
            fill(frameData[c][r]);
            rect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
        }
    }
    stroke(180); strokeWeight(1);
    for (let c = 0; c <= canvasSize; c++) { line(c * pixelSize, 0, c * pixelSize, gridHeight); }
    for (let r = 0; r <= canvasSize; r++) { line(0, r * pixelSize, width, r * pixelSize); }
    
    pop();
}

function drawPreview() {
    let { col, row } = mouseToGridCoords(mouseX, mouseY);
    if (col === null) return;
    
    push();
    translate(0, 0);
    
    if (isDrawing && currentTool === 'rectangle') {
        noFill(); stroke(255, 0, 0); strokeWeight(2);
        let x1 = min(startCol, col) * pixelSize;
        let y1 = min(startRow, row) * pixelSize;
        let x2 = (max(startCol, col) + 1) * pixelSize;
        let y2 = (max(startRow, row) + 1) * pixelSize;
        rectMode(CORNERS);
        rect(x1, y1, x2, y2);
    } else if (!isDrawing) {
        let previewColor = color(red(currentColor), green(currentColor), blue(currentColor), 150);
        fill(previewColor);
        stroke(100);
        rect(col * pixelSize, row * pixelSize, pixelSize, pixelSize);
    }
    pop();
}

function drawPixel(frameIndex, col, row, c) {
    if (col < 0 || col >= canvasSize || row < 0 || row >= canvasSize) return;
    if (animationData[frameIndex][col][row].toString() === c.toString()) return;
    
    animationData[frameIndex][col][row] = c;
    playTickSound();
    // 썸네일 업데이트는 mouseReleased에서만 처리
}

function drawRectangle(frameIndex, c1, r1, c2, r2, c) {
    let minC = min(c1, c2);
    let maxC = max(c1, c2);
    let minR = min(r1, r2);
    let maxR = max(r1, r2);

    for (let col = minC; col <= maxC; col++) {
        for (let row = minR; row <= maxR; row++) {
            if (col >= 0 && col < canvasSize && row >= 0 && row < canvasSize) {
                animationData[frameIndex][col][row] = c;
            }
        }
    }
    // 썸네일 업데이트는 mouseReleased에서만 처리
}

/** ✅ [수정] 무한 루프 버그가 수정된 drawLine 함수 */
function drawLine(frameIndex, x0, y0, x1, y1, c) {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1; // ✅ y0 < 1 버그 수정
    let err = dx + dy;

    while (true) {
        drawPixel(frameIndex, x0, y0, c);
        if (x0 === x1 && y0 === y1) break; // ✅ 무한 루프 탈출
        let e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

// --- 6. 유틸리티 함수 ---

/** 💡 한 페이지에 몇 개의 썸네일이 들어가는지 계산 */
function calculateThumbsPerPage() {
    let thumbSize = 64;
    let thumbPadding = 5;
    // 캔버스 너비에서 좌우 여백(paddding)을 뺀 공간
    let availableWidth = width - thumbPadding;
    thumbsPerPage = floor(availableWidth / (thumbSize + thumbPadding));
}

function playTickSound() {
    if (do1Sound && do1Sound.isLoaded()) {
        do1Sound.rate(2.5);
        do1Sound.setVolume(0.3);
        do1Sound.play();
    }
}

/** 마우스 좌표(px)를 그리드 좌표(col, row)로 변환합니다. */
function mouseToGridCoords(mx, my) {
    // 그리드 영역 안에서만 계산
    if (my > gridHeight) {
        return { col: null, row: null };
    }
    
    let col = floor(mx / pixelSize);
    let row = floor(my / pixelSize);

    if (col < 0 || col >= canvasSize || row < 0 || row >= canvasSize) {
        return { col: null, row: null };
    }
    return { col, row };
}

/** UI 버튼 활성 상태 업데이트 */
function updateUI() {
    // 도구 버튼
    btnPencil.style('background-color', currentTool === 'pencil' ? '#aaa' : '#fff');
    btnRect.style('background-color', currentTool === 'rectangle' ? '#aaa' : '#fff');
    
    // 색상 버튼
    btnBlack.style('background-color', red(currentColor) === 0 ? '#aaa' : '#fff');
    btnWhite.style('background-color', red(currentColor) === 255 ? '#aaa' : '#fff');
    
    // 프레임 텍스트 업데이트
    if (labelFrame) {
        labelFrame.html(`Frame: ${currentFrame + 1} / ${MAX_FRAMES}`);
    }
}

/** 1. 파일 업로드를 처리하는 메인 핸들러 */
function handleFileLoad(file) {
    if (file.type === 'image') {
        loadImage(file.data, onImageLoaded);
    } else {
        alert('이것은 이미지 파일이 아닙니다. (jpg, png 등)');
    }
}

/** 2. 이미지 로드가 완료되었을 때 실행되는 핵심 함수 */
function onImageLoaded(img) {
    const expectedWidth = canvasSize * MAX_FRAMES; // 32 * 24 = 768
    const expectedHeight = canvasSize; // 32

    if (img.width !== expectedWidth || img.height !== expectedHeight) {
        alert(`[오류] 잘못된 파일입니다!\n\n현재 설정(32x32, 24프레임)에 맞는 ${expectedWidth}x${expectedHeight} 픽셀 크기의 스프라이트 시트가 필요합니다.`);
        return;
    }

    img.loadPixels();

    for (let f = 0; f < MAX_FRAMES; f++) {
        for (let c = 0; c < canvasSize; c++) {
            for (let r = 0; r < canvasSize; r++) {
                let x = (f * canvasSize) + c;
                let y = r;
                let index = (y * img.width + x) * 4;
                let r_val = img.pixels[index];
                let g_val = img.pixels[index + 1];
                let b_val = img.pixels[index + 2];
                let a_val = img.pixels[index + 3];
                let pixelColor = color(r_val, g_val, b_val, a_val);
                animationData[f][c][r] = pixelColor;
            }
        }
    }
    
    updateAllThumbnails();
    renderPreview(currentFrame);
    
    alert('스프라이트 시트를 성공적으로 불러왔습니다!');
}

// 💡 mouseWheel() 함수 제거
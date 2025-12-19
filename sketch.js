// --- 1. 전역 변수 선언 ---

// 캔버스 설정
let canvasSize = 32;
let pixelSize;
let animationData; // [프레임][열][행]
let gridHeight; // 메인 그리드(캔버스)의 높이
let filmstripHeight = 74; // 74px 높이의 필름 스트립 영역
const PREVIEW_AREA_WIDTH = 148; // 오른쪽 프리뷰 영역(여유 포함) 너비

// 애니메이션 설정
const MAX_FRAMES = 24; // 최대 수용 프레임 수 (필요 시 코드에서 늘릴 수 있음)
let totalFrames = MAX_FRAMES; // 현재 사용 중인 프레임 수
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

// 색상 팔레트
const COLOR_PALETTE = [
    { r: 0, g: 0, b: 0 },       // 검은색
    { r: 255, g: 255, b: 255 }, // 흰색
    { r: 255, g: 0, b: 0 },     // 빨강
    { r: 0, g: 255, b: 0 },     // 초록
    { r: 0, g: 0, b: 255 },     // 파랑
    { r: 255, g: 255, b: 0 },   // 노랑
    { r: 255, g: 0, b: 255 },   // 자주
    { r: 0, g: 255, b: 255 }    // 청록
];
let colorButtons = [];

// Undo/Redo 시스템
let undoStack = [];
let redoStack = [];
const MAX_UNDO_STEPS = 50;

// 복사/붙여넣기
let clipboardFrame = null;

// 로그 패널 (알림/에러 출력용)
let logPanel;
let logLines = [];
const MAX_LOG_LINES = 30;

// UI 요소
let btnPencil, btnRect, btnBlack, btnWhite;
let btnSaveSheet, inputFileName;
let inputLoadSheet; // '불러오기' 기능
let btnPrevFrame, btnNextFrame;
let labelFrame, sliderFPS, labelFPS;
let btnUndo, btnRedo, btnCopy, btnPaste;
let btnAddFrame, btnDeleteFrame, btnDuplicateFrame;
let selectCanvasSize;
let labelTotalFrames, inputTotalFrames; // 총 프레임 수 조절용

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
    
    // 메인 그리드 + 오른쪽 프리뷰 영역까지 포함한 캔버스
    createCanvas(gridHeight + PREVIEW_AREA_WIDTH, gridHeight + filmstripHeight);

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

    // 색상 팔레트 (우측 정렬)
    let colorX = width - 20;
    let colorY = yPos + 30;
    for (let i = COLOR_PALETTE.length - 1; i >= 0; i--) {
        let pal = COLOR_PALETTE[i];
        let btn = createButton('');
        let rgb = `rgb(${pal.r},${pal.g},${pal.b})`;
        btn.style('background-color', rgb);
        btn.style('width', '30px');
        btn.style('height', '30px');
        btn.style('border', '2px solid #999');
        btn.position(colorX - (COLOR_PALETTE.length - i) * 35, colorY);
        btn.mousePressed((() => {
            let idx = i;
            return () => { currentColor = color(COLOR_PALETTE[idx].r, COLOR_PALETTE[idx].g, COLOR_PALETTE[idx].b); updateUI(); };
        })());
        colorButtons.push(btn);
    }

    // 프레임 컨트롤 (좌측)
    yPos = height + 10;
    
    // 💡 페이지 넘기기 버튼
    btnPagePrev = createButton('<<');
    btnPagePrev.position(10, yPos);
    btnPagePrev.mousePressed(goPrevPage);
    
    btnPrevFrame = createButton('◀');
    btnPrevFrame.position(btnPagePrev.x + btnPagePrev.width + 5, yPos);
    btnPrevFrame.mousePressed(goPrevFrame);

    labelFrame = createP(`Frame: ${currentFrame + 1} / ${totalFrames}`);
    labelFrame.position(btnPrevFrame.x + btnPrevFrame.width + 10, yPos - 16);

    btnNextFrame = createButton('▶');
    btnNextFrame.position(btnPrevFrame.x + btnPrevFrame.width + 90, yPos);
    btnNextFrame.mousePressed(goNextFrame);
    
    btnPageNext = createButton('>>');
    btnPageNext.position(btnNextFrame.x + btnNextFrame.width + 5, yPos);
    btnPageNext.mousePressed(goNextPage);

    // 총 프레임 수 입력
    yPos += 30;
    labelTotalFrames = createP('Frames:');
    labelTotalFrames.position(10, yPos - 16);
    inputTotalFrames = createInput(String(totalFrames), 'number');
    inputTotalFrames.position(80, yPos);
    inputTotalFrames.size(50);
    inputTotalFrames.elt.min = '1';
    inputTotalFrames.elt.max = String(MAX_FRAMES);
    inputTotalFrames.input(onTotalFramesInput);

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

    // 캔버스 크기 선택 (좌측)
    yPos += 40;
    selectCanvasSize = createSelect();
    selectCanvasSize.position(10, yPos);
    selectCanvasSize.option('16 x 16', 16);
    selectCanvasSize.option('32 x 32', 32);
    selectCanvasSize.option('64 x 64', 64);
    selectCanvasSize.selected(canvasSize);
    selectCanvasSize.changed(onCanvasSizeChange);

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
    
    // Undo/Redo/Copy/Paste (좌측)
    yPos += 40;
    btnUndo = createButton('↶ Undo');
    btnRedo = createButton('↷ Redo');
    btnCopy = createButton('📋 Copy Frame');
    btnPaste = createButton('📌 Paste');
    btnUndo.position(10, yPos);
    btnRedo.position(btnUndo.x + btnUndo.width + 5, yPos);
    btnCopy.position(btnRedo.x + btnRedo.width + 5, yPos);
    btnPaste.position(btnCopy.x + btnCopy.width + 5, yPos);
    btnUndo.mousePressed(undo);
    btnRedo.mousePressed(redo);
    btnCopy.mousePressed(copyFrame);
    btnPaste.mousePressed(pasteFrame);

    // 프레임 삽입/삭제/복제 버튼
    yPos += 40;
    btnAddFrame = createButton('+ Frame');
    btnDeleteFrame = createButton('- Frame');
    btnDuplicateFrame = createButton('Clone');
    btnAddFrame.position(10, yPos);
    btnDeleteFrame.position(btnAddFrame.x + btnAddFrame.width + 5, yPos);
    btnDuplicateFrame.position(btnDeleteFrame.x + btnDeleteFrame.width + 5, yPos);
    btnAddFrame.mousePressed(insertFrameAfter);
    btnDeleteFrame.mousePressed(deleteCurrentFrame);
    btnDuplicateFrame.mousePressed(duplicateCurrentFrame);

    // 로그 패널 생성 (콘솔처럼 메시지 표시)
    yPos += 40;
    logPanel = createDiv('');
    logPanel.position(10, yPos);
    logPanel.size(width - 20, 80);
    logPanel.style('background', '#111');
    logPanel.style('color', '#0f0');
    logPanel.style('font-family', 'monospace');
    logPanel.style('font-size', '12px');
    logPanel.style('padding', '4px');
    logPanel.style('overflow-y', 'auto');

    // 💡 썸네일 개수 초기 계산
    calculateThumbsPerPage();
    
    // Undo/Redo 초기 스냅샷
    saveUndoSnapshot();
    
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
    // 메인 그리드 오른쪽에 프리뷰 표시
    image(previewCanvas, gridHeight + 10, 10); 
    noFill();
    stroke(255);
    rect(gridHeight + 10, 10, 128, 128);

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
    
    // Undo 스냅샷 저장
    saveUndoSnapshot();
}

function windowResized() {
    gridHeight = min(windowWidth, windowHeight) * 0.7;
    pixelSize = gridHeight / canvasSize;
    resizeCanvas(gridHeight + PREVIEW_AREA_WIDTH, gridHeight + filmstripHeight);

    // 💡 썸네일 개수 다시 계산
    calculateThumbsPerPage();

    // UI 위치 재조정
    let yPos = height + 10;
    btnPencil.position(width - 130, yPos);
    btnRect.position(width - 70, yPos);
    
    // 색상 팔레트 위치 조정
    let colorX = width - 20;
    let colorY = yPos + 30;
    for (let i = 0; i < colorButtons.length; i++) {
        colorButtons[i].position(colorX - (COLOR_PALETTE.length - i) * 35, colorY);
    }
    
    yPos = height + 10;
    btnPagePrev.position(10, yPos);
    btnPrevFrame.position(btnPagePrev.x + btnPagePrev.width + 5, yPos);
    labelFrame.position(btnPrevFrame.x + btnPrevFrame.width + 10, yPos - 16);
    btnNextFrame.position(btnPrevFrame.x + btnPrevFrame.width + 90, yPos);
    btnPageNext.position(btnNextFrame.x + btnNextFrame.width + 5, yPos);
    
    // 총 프레임 수 입력 위치 재조정
    yPos += 30;
    if (labelTotalFrames && inputTotalFrames) {
        labelTotalFrames.position(10, yPos - 16);
        inputTotalFrames.position(80, yPos);
    }

    yPos += 40;
    labelFPS.position(10, yPos - 16);
    sliderFPS.position(60, yPos);
    yPos += 40;
    if (selectCanvasSize) {
        selectCanvasSize.position(10, yPos);
    }
    yPos += 40;
    inputFileName.position(10, yPos);
    btnSaveSheet.position(inputFileName.x + inputFileName.width + 10, yPos);
    inputLoadSheet.position(btnSaveSheet.x + btnSaveSheet.width + 10, yPos);
    yPos += 40;
    btnUndo.position(10, yPos);
    btnRedo.position(btnUndo.x + btnUndo.width + 5, yPos);
    btnCopy.position(btnRedo.x + btnRedo.width + 5, yPos);
    btnPaste.position(btnCopy.x + btnCopy.width + 5, yPos);
    yPos += 40;
    if (btnAddFrame && btnDeleteFrame && btnDuplicateFrame) {
        btnAddFrame.position(10, yPos);
        btnDeleteFrame.position(btnAddFrame.x + btnAddFrame.width + 5, yPos);
        btnDuplicateFrame.position(btnDeleteFrame.x + btnDeleteFrame.width + 5, yPos);
    }

    yPos += 40;
    if (logPanel) {
        logPanel.position(10, yPos);
        logPanel.size(width - 20, 80);
    }
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

        // 사용 중인 프레임 수를 넘어가면 그리기 중단
        if (frameIndex >= totalFrames) {
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

        if (frameIndex >= totalFrames) {
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

// 마우스 휠로 프레임 이동
function mouseWheel(event) {
    if (event.deltaY > 0) {
        goNextFrame();
    } else if (event.deltaY < 0) {
        goPrevFrame();
    }
    // 브라우저 기본 스크롤 방지
    return false;
}

// 키보드 단축키 처리
function keyPressed() {
    // 입력창에 포커스가 있을 때는 단축키 무시
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        return;
    }

    // 프레임 이동: 좌/우 화살표
    if (keyCode === LEFT_ARROW) {
        goPrevFrame();
        return false;
    }
    if (keyCode === RIGHT_ARROW) {
        goNextFrame();
        return false;
    }

    // Undo: Ctrl+Z (Shift 없이)
    if ((key === 'z' || key === 'Z') && keyIsDown(CONTROL) && !keyIsDown(SHIFT)) {
        undo();
        return false;
    }

    // Redo: Ctrl+Y 또는 Ctrl+Shift+Z
    if ((key === 'y' || key === 'Y') && keyIsDown(CONTROL)) {
        redo();
        return false;
    }
    if ((key === 'z' || key === 'Z') && keyIsDown(CONTROL) && keyIsDown(SHIFT)) {
        redo();
        return false;
    }

    // 프레임 복사/붙여넣기: Ctrl+C / Ctrl+V
    if ((key === 'c' || key === 'C') && keyIsDown(CONTROL)) {
        copyFrame();
    }
    if ((key === 'v' || key === 'V') && keyIsDown(CONTROL)) {
        pasteFrame();
    }
}

// (saveSpriteSheet, handlePlayback, renderPreview, sanitizeFileName 함수는 동일하게 유지)
function saveSpriteSheet() {
    const scale = 1;
    const outWidth = canvasSize * totalFrames;
    const outHeight = canvasSize;
    const off = document.createElement('canvas');
    off.width = outWidth;
    off.height = outHeight;
    const ctx = off.getContext('2d');
    function p5ColorToRGBA(p5Color) {
        return `rgba(${red(p5Color)}, ${green(p5Color)}, ${blue(p5Color)}, ${alpha(p5Color) / 255})`;
    }
    for (let f = 0; f < totalFrames; f++) {
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
        if (totalFrames > 0) {
            previewFrame = (previewFrame + 1) % totalFrames;
            renderPreview(previewFrame);
        }
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
    if (totalFrames <= 0) return;
    currentFrame = (currentFrame + 1) % totalFrames;
    updateUI();
    ensureFrameVisible(currentFrame); // 💡 페이지 자동 넘김
}

/** 이전 프레임으로 이동 */
function goPrevFrame() {
    if (totalFrames <= 0) return;
    currentFrame = (currentFrame - 1 + totalFrames) % totalFrames;
    updateUI();
    ensureFrameVisible(currentFrame); // 💡 페이지 자동 넘김
}

/** 💡 다음 '페이지'로 이동 */
function goNextPage() {
    frameOffset += thumbsPerPage;
    // 사용 중인 프레임 내에서 최대 오프셋 제한
    frameOffset = min(frameOffset, max(0, totalFrames - thumbsPerPage));
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
    if (frameIndex < 0 || frameIndex >= totalFrames) return;
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
    for (let i = 0; i < totalFrames; i++) {
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
    // 가로선은 메인 그리드 영역까지만
    for (let r = 0; r <= canvasSize; r++) { line(0, r * pixelSize, gridHeight, r * pixelSize); }
    
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
}

function saveUndoSnapshot() {
    // 현재 animationData를 RGBA 숫자 배열로 깊은 복사해서 스냅샷으로 저장
    let snapshot = [];
    for (let f = 0; f < MAX_FRAMES; f++) {
        let frameSnap = [];
        for (let c = 0; c < canvasSize; c++) {
            let colSnap = [];
            for (let r = 0; r < canvasSize; r++) {
                let col = animationData[f][c][r];
                colSnap.push([
                    red(col),
                    green(col),
                    blue(col),
                    alpha(col)
                ]);
            }
            frameSnap.push(colSnap);
        }
        snapshot.push(frameSnap);
    }

    undoStack.push(snapshot);
    redoStack = []; // Redo 스택 초기화

    // 최대 스텝 수 초과 시 가장 오래된 항목 제거
    if (undoStack.length > MAX_UNDO_STEPS) {
        undoStack.shift();
    }

    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length <= 1) {
        logMessage('더 이상 실행취소할 수 없습니다.');
        return;
    }
    // 현재 상태를 Redo 스택에 저장
    redoStack.push(undoStack.pop());

    // Undo 스택의 마지막 스냅샷으로 복원
    let snapshot = undoStack[undoStack.length - 1];
    restoreFromSnapshot(snapshot);
    updateAllThumbnails();
    renderPreview(currentFrame);
    updateUndoRedoButtons();
}

function redo() {
    if (redoStack.length === 0) {
        logMessage('더 이상 재실행할 수 없습니다.');
        return;
    }
    
    // Redo 스택의 스냅샷을 Undo 스택으로 옮기고 복원
    let snapshot = redoStack.pop();
    undoStack.push(snapshot);
    restoreFromSnapshot(snapshot);
    updateAllThumbnails();
    renderPreview(currentFrame);
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    if (btnUndo) btnUndo.style('opacity', undoStack.length > 1 ? '1' : '0.5');
    if (btnRedo) btnRedo.style('opacity', redoStack.length > 0 ? '1' : '0.5');
}

// 현재 캔버스 크기에 맞는 새 흰색 프레임 생성
function createBlankFrame() {
    let white = color(255);
    let frame = [];
    for (let c = 0; c < canvasSize; c++) {
        let colArr = [];
        for (let r = 0; r < canvasSize; r++) {
            colArr.push(white);
        }
        frame.push(colArr);
    }
    return frame;
}

// 지정된 프레임을 깊은 복사
function cloneFrameData(frameIndex) {
    let src = animationData[frameIndex];
    let cloned = [];
    for (let c = 0; c < canvasSize; c++) {
        let colArr = [];
        for (let r = 0; r < canvasSize; r++) {
            colArr.push(color(src[c][r]));
        }
        cloned.push(colArr);
    }
    return cloned;
}

function copyFrame() {
    // 현재 프레임을 깊은 복사로 클립보드에 저장 (JSON 사용 X)
    let srcFrame = animationData[currentFrame];
    let copied = [];
    for (let c = 0; c < canvasSize; c++) {
        let colArr = [];
        for (let r = 0; r < canvasSize; r++) {
            // p5.Color를 그대로 참조하지 않고 새 color 객체로 복사
            colArr.push(color(srcFrame[c][r]));
        }
        copied.push(colArr);
    }
    clipboardFrame = copied;
    logMessage(`프레임 ${currentFrame + 1}을 복사했습니다.`);
}

function pasteFrame() {
    if (!clipboardFrame) {
        logMessage('복사한 프레임이 없습니다.');
        return;
    }

    // Undo를 위해 현재 상태 저장
    saveUndoSnapshot();

    // 클립보드 내용을 현재 프레임에 깊은 복사로 붙여넣기
    let pasted = [];
    for (let c = 0; c < canvasSize; c++) {
        let colArr = [];
        for (let r = 0; r < canvasSize; r++) {
            colArr.push(color(clipboardFrame[c][r]));
        }
        pasted.push(colArr);
    }
    animationData[currentFrame] = pasted;

    updateThumbnail(currentFrame);
    renderPreview(currentFrame);
    logMessage(`프레임 ${currentFrame + 1}에 붙여넣었습니다.`);
}

// 현재 프레임 뒤에 빈 프레임 삽입
function insertFrameAfter() {
    if (totalFrames >= MAX_FRAMES) {
        logMessage(`프레임을 더 추가할 수 없습니다. (최대 ${MAX_FRAMES}프레임)`);
        return;
    }

    let insertIndex = currentFrame + 1;

    // 뒤에서부터 한 칸씩 밀기
    for (let f = totalFrames; f > insertIndex; f--) {
        animationData[f] = animationData[f - 1];
        thumbnailGraphics[f] = thumbnailGraphics[f - 1];
    }

    // 새 빈 프레임 삽입
    animationData[insertIndex] = createBlankFrame();
    updateThumbnail(insertIndex);

    totalFrames++;
    currentFrame = insertIndex;
    ensureFrameVisible(currentFrame);
    saveUndoSnapshot();
    updateUI();
    renderPreview(currentFrame);
    logMessage(`프레임 ${currentFrame + 1}을 삽입했습니다. (총 ${totalFrames}프레임)`);
}

// 현재 프레임 삭제
function deleteCurrentFrame() {
    if (totalFrames <= 1) {
        logMessage('마지막 프레임은 삭제할 수 없습니다.');
        return;
    }

    for (let f = currentFrame; f < totalFrames - 1; f++) {
        animationData[f] = animationData[f + 1];
        thumbnailGraphics[f] = thumbnailGraphics[f + 1];
    }

    // 마지막 사용 프레임을 흰색으로 초기화
    animationData[totalFrames - 1] = createBlankFrame();
    updateThumbnail(totalFrames - 1);

    totalFrames--;
    if (currentFrame >= totalFrames) {
        currentFrame = totalFrames - 1;
    }

    ensureFrameVisible(currentFrame);
    saveUndoSnapshot();
    updateUI();
    renderPreview(currentFrame);
    logMessage(`프레임을 삭제했습니다. 현재 프레임: ${currentFrame + 1}/${totalFrames}`);
}

// 현재 프레임 복제 후 뒤에 삽입
function duplicateCurrentFrame() {
    if (totalFrames >= MAX_FRAMES) {
        logMessage(`프레임을 더 복제할 수 없습니다. (최대 ${MAX_FRAMES}프레임)`);
        return;
    }

    let insertIndex = currentFrame + 1;

    // 뒤에서부터 한 칸씩 밀기
    for (let f = totalFrames; f > insertIndex; f--) {
        animationData[f] = animationData[f - 1];
        thumbnailGraphics[f] = thumbnailGraphics[f - 1];
    }

    // 현재 프레임 깊은 복사 후 삽입
    animationData[insertIndex] = cloneFrameData(currentFrame);
    updateThumbnail(insertIndex);

    totalFrames++;
    currentFrame = insertIndex;
    ensureFrameVisible(currentFrame);
    saveUndoSnapshot();
    updateUI();
    renderPreview(currentFrame);
    logMessage(`프레임 ${currentFrame}을 복제했습니다. (새 프레임: ${currentFrame + 1}, 총 ${totalFrames})`);
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
    
    // 색상 버튼 업데이트
    let r = red(currentColor);
    let g = green(currentColor);
    let b = blue(currentColor);
    
    for (let i = 0; i < colorButtons.length; i++) {
        let pal = COLOR_PALETTE[i];
        if (pal.r === r && pal.g === g && pal.b === b) {
            colorButtons[i].style('border', '3px solid #000');
        } else {
            colorButtons[i].style('border', '2px solid #999');
        }
    }
    
    // 프레임 텍스트 업데이트
    if (labelFrame) {
        labelFrame.html(`Frame: ${currentFrame + 1} / ${totalFrames}`);
    }

    // 총 프레임 입력값 동기화
    if (inputTotalFrames) {
        inputTotalFrames.value(String(totalFrames));
    }
}

/** 1. 파일 업로드를 처리하는 메인 핸들러 */
function handleFileLoad(file) {
    if (file.type === 'image') {
        loadImage(file.data, onImageLoaded);
    } else {
        logMessage('이것은 이미지 파일이 아닙니다. (jpg, png 등)');
    }
}

/** 2. 이미지 로드가 완료되었을 때 실행되는 핵심 함수 */
function onImageLoaded(img) {
    const expectedHeight = canvasSize; // 32

    // 높이는 현재 캔버스 크기와 같아야 하고, 너비는 canvasSize의 정수배여야 함
    if (img.height !== expectedHeight || img.width % canvasSize !== 0) {
        logMessage(`[오류] 잘못된 파일입니다. 폭은 캔버스 크기의 정수배, 높이는 ${expectedHeight}이어야 합니다.`);
        return;
    }

    const loadedFrames = img.width / canvasSize;
    if (loadedFrames > MAX_FRAMES) {
        logMessage(`[오류] 최대 ${MAX_FRAMES}프레임까지 지원합니다. (이미지에는 ${loadedFrames}프레임이 있습니다.)`);
        return;
    }

    totalFrames = loadedFrames;

    img.loadPixels();

    for (let f = 0; f < totalFrames; f++) {
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
    
    logMessage('스프라이트 시트를 성공적으로 불러왔습니다.');
}

// --- 7. 로그 유틸리티 ---

// 총 프레임 수 입력 변경 처리
function onTotalFramesInput() {
    if (!inputTotalFrames) return;

    let v = int(inputTotalFrames.value());
    if (isNaN(v)) return;

    v = constrain(v, 1, MAX_FRAMES);

    if (v === totalFrames) {
        // 값이 같으면 UI만 정규화
        inputTotalFrames.value(String(totalFrames));
        return;
    }

    // 새로 사용하는 프레임/사용하지 않는 프레임을 초기화해 예측 가능하게 유지
    if (v > totalFrames) {
        // 늘어나는 구간은 빈 프레임으로 초기화
        for (let f = totalFrames; f < v; f++) {
            animationData[f] = createBlankFrame();
            updateThumbnail(f);
        }
    } else {
        // 줄어드는 구간은 다시 사용할 수 있도록 미리 흰색으로 초기화
        for (let f = v; f < totalFrames; f++) {
            animationData[f] = createBlankFrame();
            updateThumbnail(f);
        }
    }

    totalFrames = v;

    if (currentFrame >= totalFrames) {
        currentFrame = totalFrames - 1;
    }
    if (previewFrame >= totalFrames) {
        previewFrame = 0;
    }

    // 필름 스트립 페이지 오프셋 보정
    frameOffset = min(frameOffset, max(0, totalFrames - thumbsPerPage));

    saveUndoSnapshot();
    renderPreview(currentFrame);
    updateUI();
    logMessage(`총 프레임 수를 ${totalFrames}로 설정했습니다.`);
}

// 캔버스 크기 변경 시 전체 데이터/썸네일/스택을 재초기화
function onCanvasSizeChange() {
    let newSize = int(selectCanvasSize.value());
    if (newSize === canvasSize) return;

    canvasSize = newSize;
    pixelSize = gridHeight / canvasSize;

    // 애니메이션 데이터 다시 생성 (모든 프레임 흰색)
    let white = color(255);
    animationData = Array(MAX_FRAMES).fill(null).map(() =>
        Array(canvasSize).fill(null).map(() =>
            Array(canvasSize).fill(white)
        )
    );

    // 썸네일 그래픽도 새로 생성
    thumbnailGraphics = [];
    for (let i = 0; i < MAX_FRAMES; i++) {
        let gfx = createGraphics(canvasSize, canvasSize);
        gfx.noSmooth();
        gfx.background(255);
        thumbnailGraphics.push(gfx);
    }

    totalFrames = 1;
    currentFrame = 0;
    previewFrame = 0;
    frameOffset = 0;

    undoStack = [];
    redoStack = [];
    saveUndoSnapshot();

    updateAllThumbnails();
    renderPreview(currentFrame);
    updateUI();
    calculateThumbsPerPage();
    logMessage(`캔버스 크기를 ${canvasSize}x${canvasSize}로 변경했습니다. (프레임이 초기화되었습니다.)`);
}

// Undo/Redo 스냅샷을 animationData로 복원하는 헬퍼
function restoreFromSnapshot(snapshot) {
    let newData = [];
    for (let f = 0; f < MAX_FRAMES; f++) {
        let frameData = [];
        for (let c = 0; c < canvasSize; c++) {
            let colArr = [];
            for (let r = 0; r < canvasSize; r++) {
                let rgba = snapshot[f][c][r];
                colArr.push(color(rgba[0], rgba[1], rgba[2], rgba[3]));
            }
            frameData.push(colArr);
        }
        newData.push(frameData);
    }
    animationData = newData;
}

function logMessage(msg) {
    // p5가 준비되기 전이면 콘솔에만 출력
    if (!logPanel) {
        console.log(msg);
        return;
    }

    // 타임스탬프 추가 (HH:MM:SS)
    let h = hour();
    let m = minute();
    let s = second();
    let timeStr = nf(h, 2) + ':' + nf(m, 2) + ':' + nf(s, 2);

    logLines.push(`[${timeStr}] ${msg}`);
    if (logLines.length > MAX_LOG_LINES) {
        logLines.shift();
    }

    logPanel.html(logLines.join('<br>'));
    console.log(msg);
}

// 💡 mouseWheel() 함수 재도입: 휠로 프레임 이동
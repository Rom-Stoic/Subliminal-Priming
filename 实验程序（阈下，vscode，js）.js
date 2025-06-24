// exp.js - 阈下启动实验（使用CFS技术呈现刺激）

// --- 1. 环境和全局变量 ---
let exp; // ExpPsyJS 应用实例

// UI 组件
let instructionScreen, debriefScreen, fixationCross, restScreen, practiceInstructionScreen, formalInstructionScreen;
let targetCanvas, targetDisplay; // 靶子显示组件
let mouseStableIndicator; // 鼠标稳定性指示器
let cfsContainer; // CFS刺激显示容器
let maskElement, stimulusElement; // CFS蒙版和刺激元素
let progressBar, progressBarContainer, progressText; // 进度条组件

// 计时器
let timerFixation, timerMouseStable;
let timerCfsPresentation;

// 实验状态和数据
let arrAllTrials = []; // 存储所有试次信息的数组
let arrResults = [];   // 存储实验结果的数组
let currentTrialIndex = 0; // 当前试次的索引
let subjectResponded = false; // 标记被试是否已在本试次做出反应
let targetOnsetTimestamp = 0; // 目标刺激呈现的时间戳，用于计算反应时
let targetPosition = { x: 0, y: 0 }; // 靶子中心位置
let isMouseInCenter = false; // 标记鼠标是否在屏幕中心
let mouseStableDuration = 0; // 鼠标在中心区域稳定的持续时间
let cfsMaskIndex = 0; // 当前显示的CFS蒙版索引
let cfsMaskImages = { // 存储CFS蒙版图片的对象
    red: [],
    blue: []
};
let cfsStimulusImages = { // 存储CFS刺激图片的对象
    neutral: { red: [], blue: [] },
    speed: { red: [], blue: [] },
    accuracy: { red: [], blue: [] }
};
let cfsMaskInterval; // CFS蒙版闪烁的定时器

// 配置常量
const REQUIRED_STABLE_DURATION = 1000; // 鼠标需要在中心区域稳定的时间（毫秒）
const FIXATION_DURATION_MS = 500;       // 注视点持续时长 (毫秒)
const CFS_PRESENTATION_DURATION_MS = 1000; // CFS蒙版和刺激同时呈现的持续时间 (毫秒)
const CFS_MASK_FLASH_RATE = 100;        // CFS蒙版闪烁频率 (毫秒)，10Hz = 100ms
const TARGET_POSITION_RADIUS = 250;     // 靶子中心随机位置的圆半径 (像素)
const CENTER_AREA_RADIUS = 100;          // 屏幕中心区域半径，用于判断鼠标是否在中心 (像素)
const CFS_DISPLAY_SIZE = 5;           // CFS显示区域大小 (厘米)
const PIXELS_PER_CM = 37.8;             // 每厘米像素数（基于标准96DPI显示器）

const CFS_MASK_CONTRAST = "150%";       // 蒙版对比度 
const CFS_STIMULUS_CONTRAST = "55%";   // 刺激对比度 

const NUM_PRACTICE_BLOCKS = 3;          // 练习区组数量
const NUM_MAIN_BLOCKS = 30;             // 主要区组数量
const TRIALS_PER_BLOCK = 3;             // 每个区组包含的试次数

// 刺激材料
const PRIME_CONDITIONS = ['neutral', 'speed', 'accuracy']; // 启动条件类型

// 鼠标位置历史记录，用于计算稳定性
let mousePositions = [];
const STABILITY_SAMPLE_SIZE = 10; // 用于计算稳定性的样本数量
const STABILITY_THRESHOLD = 5; // 鼠标稳定性阈值（像素）

// --- 2. 辅助函数 ---

// Box-Muller 变换生成正态分布随机数
function normalRandom(mean, stdDev) {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
}

// 获取一个大于最小值的正态分布随机数
function getPositiveNormalRandom(mean, stdDev, minVal = 16) {
    let duration = normalRandom(mean, stdDev);
    return Math.max(minVal, Math.round(duration));
}

// 数组随机打乱
if (!Array.prototype.shuffle) {
    Object.defineProperty(Array.prototype, 'shuffle', {
        value: function() {
            for (let i = this.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this[i], this[j]] = [this[j], this[i]];
            }
            return this;
        }
    });
}

// 创建文本显示组件
function createTextDisplay(message, fontSize = 32, width = 1200, align = "center", visible = false) {
    let tb = new ExpPsyJS.UI.TextBox({
        mesg: message,
        fontSize: fontSize,
        width: width,
        height: 'auto',
        align: align,
        fontFamily: 'Arial, Microsoft YaHei, sans-serif',
        fill: ['#FFFFFF'],
    });
    tb.visible = visible;
    ExpPsyJS.moveToCenter(tb, exp.screen);
    exp.stage.addChild(tb);
    return tb;
}

// 创建靶子显示组件（同心圆环样式）
function createTargetDisplay() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    
    const dpr = window.devicePixelRatio || 1;
    const width = 300;
    const height = 300;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // 绘制靶子（同心圆环样式）
    function drawTarget() {
        const centerX = width / 2;
        const centerY = height / 2;
        
        ctx.clearRect(0, 0, width, height);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
        ctx.fillStyle = 'black';
        ctx.fill();
        
        const ringRadii = [100, 85, 70, 55, 40, 25, 10];
        const ringColors = ['white', 'black', 'white', 'black', 'white', 'black', 'red'];
        
        for (let i = 0; i < ringRadii.length; i++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, ringRadii[i], 0, Math.PI * 2);
            
            if (i > 0) {
                ctx.arc(centerX, centerY, ringRadii[i-1], 0, Math.PI * 2, true);
            }
            
            ctx.fillStyle = ringColors[i];
            ctx.fill();
        }
    }
    
    drawTarget();
    
    return canvas;
}

// 创建鼠标稳定性指示器
function createMouseStableIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'mouse-stable-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: ${CENTER_AREA_RADIUS * 2}px;
        height: ${CENTER_AREA_RADIUS * 2}px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 16px;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    document.body.appendChild(indicator);
    
    return indicator;
}

// 创建CFS刺激显示容器
function createCfsContainer() {
    const container = document.createElement('div');
    container.id = 'cfs-container';
    
    // 计算3.5cm×3.5cm对应的像素尺寸
    const sizeInPixels = CFS_DISPLAY_SIZE * PIXELS_PER_CM;
    
    container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: ${sizeInPixels}px;
        height: ${sizeInPixels}px;
        pointer-events: none;
        display: none;
        z-index: 500;
    `;
    
    // 创建蒙版元素
    maskElement = document.createElement('img');
    maskElement.id = 'cfs-mask';
    maskElement.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        opacity: 1.0;  /* 设置蒙版透明度*/
        filter: contrast(${CFS_MASK_CONTRAST}); /* 设置蒙版对比度 */
    `;
    
    // 创建刺激元素
    stimulusElement = document.createElement('img');
    stimulusElement.id = 'cfs-stimulus';
    stimulusElement.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        opacity: 0.45; /* 设置刺激透明度 */
        filter: contrast(${CFS_STIMULUS_CONTRAST}); /* 设置刺激对比度 */
    `;
    
    container.appendChild(maskElement);
    container.appendChild(stimulusElement);
    document.body.appendChild(container);
    
    return container;
}

// 创建进度条
function createProgressBar() {
    // 创建进度条容器
    progressBarContainer = document.createElement('div');
    progressBarContainer.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 80%;
        max-width: 800px;
        height: 10px;
        background-color: rgba(255, 255, 255, 0.2);
        border-radius: 5px;
        z-index: 2000;
    `;
    
    // 创建进度条
    progressBar = document.createElement('div');
    progressBar.style.cssText = `
        height: 100%;
        width: 0%;
        background-color: rgba(0, 255, 0, 0.8);
        border-radius: 5px;
        transition: width 0.5s ease;
    `;
    
    // 创建进度文本
    progressText = document.createElement('div');
    progressText.style.cssText = `
        position: fixed;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-size: 16px;
        z-index: 2000;
    `;
    
    progressBarContainer.appendChild(progressBar);
    document.body.appendChild(progressBarContainer);
    document.body.appendChild(progressText);
    
    return { progressBar, progressBarContainer, progressText };
}

// 加载CFS蒙版和刺激图片
async function loadCfsImages() {
    console.log("开始加载CFS图片...");
    
    // 加载红色蒙版图片
    for (let i = 1; i <= 10; i++) {
        const img = new Image();
        img.src = `实验材料/mask/smallrednoise/noise${i}.bmp`;
        cfsMaskImages.red.push(img);
        
        await new Promise(resolve => {
            img.onload = resolve;
            img.onerror = () => {
                console.error(`加载红色蒙版图片 noise${i}.bmp 失败`);
                resolve();
            };
        });
    }
    
    // 加载蓝色蒙版图片
    for (let i = 1; i <= 10; i++) {
        const img = new Image();
        img.src = `实验材料/mask/smallbluenoise/noise${i}.bmp`;
        cfsMaskImages.blue.push(img);
        
        await new Promise(resolve => {
            img.onload = resolve;
            img.onerror = () => {
                console.error(`加载蓝色蒙版图片 noise${i}.bmp 失败`);
                resolve();
            };
        });
    }
    
    console.log(`成功加载 ${cfsMaskImages.red.length} 张红色蒙版图片`);
    console.log(`成功加载 ${cfsMaskImages.blue.length} 张蓝色蒙版图片`);
    
    // 加载刺激图片
    for (const condition of PRIME_CONDITIONS) {
        // 加载红色通道刺激图片
        for (let i = 1; i <= 30; i++) {
            const img = new Image();
            img.src = `实验材料/stimulus_sub/${condition}/red_channel/${i}.bmp`;
            cfsStimulusImages[condition].red.push(img);
            
            await new Promise(resolve => {
                img.onload = resolve;
                img.onerror = () => {
                    console.error(`加载${condition}红色通道刺激图片 ${i}.bmp 失败`);
                    resolve();
                };
            });
        }
        
        // 加载蓝色通道刺激图片
        for (let i = 1; i <= 30; i++) {
            const img = new Image();
            img.src = `实验材料/stimulus_sub/${condition}/blue_channel/${i}.bmp`;
            cfsStimulusImages[condition].blue.push(img);
            
            await new Promise(resolve => {
                img.onload = resolve;
                img.onerror = () => {
                    console.error(`加载${condition}蓝色通道刺激图片 ${i}.bmp 失败`);
                    resolve();
                };
            });
        }
        
        console.log(`成功加载 ${cfsStimulusImages[condition].red.length} 张${condition}红色通道刺激图片`);
        console.log(`成功加载 ${cfsStimulusImages[condition].blue.length} 张${condition}蓝色通道刺激图片`);
    }
    
    console.log("CFS图片加载完成");
}

// 计算两点之间的距离
function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// 计算鼠标稳定性
function calculateMouseStability() {
    if (mousePositions.length < STABILITY_SAMPLE_SIZE) {
        return false;
    }
    
    let avgX = 0, avgY = 0;
    mousePositions.forEach(pos => {
        avgX += pos.x;
        avgY += pos.y;
    });
    avgX /= mousePositions.length;
    avgY /= mousePositions.length;
    
    let avgDistance = 0;
    mousePositions.forEach(pos => {
        avgDistance += calculateDistance(pos.x, pos.y, avgX, avgY);
    });
    avgDistance /= mousePositions.length;
    
    return avgDistance < STABILITY_THRESHOLD;
}

// 更新鼠标稳定性指示器
function updateMouseStableIndicator() {
    if (!mouseStableIndicator) return;
    
    if (isMouseInCenter) {
        const stabilityPercent = Math.min(100, (mouseStableDuration / REQUIRED_STABLE_DURATION) * 100);
        mouseStableIndicator.style.opacity = '1';
        mouseStableIndicator.style.borderColor = `rgba(0, 255, 0, ${stabilityPercent / 100})`;
        mouseStableIndicator.textContent = `${Math.round(stabilityPercent)}%`;
    } else {
        mouseStableIndicator.style.opacity = '0';
        mouseStableIndicator.textContent = '';
    }
}

// 随机生成靶子位置
function generateRandomTargetPosition() {
    // 使用window.innerWidth和window.innerHeight获取视口尺寸
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const angle = Math.random() * Math.PI * 2;
    const x = centerX + Math.cos(angle) * TARGET_POSITION_RADIUS;
    const y = centerY + Math.sin(angle) * TARGET_POSITION_RADIUS;
    
    return { x, y };
}

// 更新进度条
function updateProgressBar() {
    if (!progressBar || !progressText) return;
    
    const currentBlock = Math.ceil((currentTrialIndex + 1) / TRIALS_PER_BLOCK);
    const isPractice = currentBlock <= NUM_PRACTICE_BLOCKS;
    
    if (isPractice) {
        // 练习阶段不显示进度条
        progressBarContainer.style.display = 'none';
        progressText.style.display = 'none';
    } else {
        // 正式实验阶段显示进度条
        progressBarContainer.style.display = 'block';
        progressText.style.display = 'block';
        
        // 计算正式实验的进度
        const formalBlock = currentBlock - NUM_PRACTICE_BLOCKS;
        const progressPercent = ((formalBlock - 1) / NUM_MAIN_BLOCKS) * 100;
        
        progressBar.style.width = `${progressPercent}%`;
        progressText.textContent = `当前: ${formalBlock}/${NUM_MAIN_BLOCKS}`;
    }
}

// 开始CFS呈现（蒙版和刺激同时显示）
function startCfsPresentation() {
    console.log(performance.now(), "开始CFS呈现");
    
    fixationCross.visible = false;
    
    const trialData = arrAllTrials[currentTrialIndex];
    const condition = trialData.primeCondition;
    
    // 固定使用红色蒙版和蓝色通道刺激
    const maskImages = cfsMaskImages.red;
    const stimulusColor = "blue";
    
    // 计算刺激图片索引
    // 对于正式实验，从1.bmp开始按顺序使用图片
    // 正式实验的第一个block（第4个block）使用1.bmp（索引0）
    // 正式实验的第二个block（第5个block）使用2.bmp（索引1），以此类推
    let imageIndex;
    
    if (trialData.isPractice) {
        // 练习试次不使用刺激图片
        imageIndex = 0;
    } else {
        // 正式实验：block 4对应索引0（1.bmp），block 5对应索引1（2.bmp），以此类推
        imageIndex = trialData.blockNum - NUM_PRACTICE_BLOCKS - 1;
    }
    
    // 确保索引在有效范围内
    const safeIndex = Math.min(imageIndex, cfsStimulusImages[condition][stimulusColor].length - 1);
    const stimulusImage = cfsStimulusImages[condition][stimulusColor][safeIndex];
    
    cfsContainer.style.display = 'block';
    cfsMaskIndex = 0;
    maskElement.src = maskImages[0].src;
    
    // 如果是练习试次，则不显示刺激图片
    if (trialData.isPractice) {
        stimulusElement.style.display = 'none';
    } else {
        stimulusElement.style.display = 'block';
        stimulusElement.src = stimulusImage.src;
    }
    
    // 记录颜色组合到试次数据
    trialData.maskColor = "red";
    trialData.stimulusColor = "blue";
    
    // 记录使用的图片编号
    trialData.imageNumber = trialData.isPractice ? 0 : imageIndex + 1;
    
    // 开始蒙版闪烁
    cfsMaskInterval = setInterval(() => {
        cfsMaskIndex = (cfsMaskIndex + 1) % maskImages.length;
        if (cfsMaskIndex < maskImages.length) {
            maskElement.src = maskImages[cfsMaskIndex].src;
        }
    }, CFS_MASK_FLASH_RATE);
    
    // 设置CFS呈现持续时间
    timerCfsPresentation = new ExpPsyJS.Timer(CFS_PRESENTATION_DURATION_MS);
    timerCfsPresentation.on('end', endCfsPresentation);
    timerCfsPresentation.start();
}

// 结束CFS呈现
function endCfsPresentation() {
    console.log(performance.now(), "结束CFS呈现");
    
    clearInterval(cfsMaskInterval);
    cfsContainer.style.display = 'none';
    
    // 恢复刺激元素显示
    if (stimulusElement) {
        stimulusElement.style.display = 'block';
    }
    
    startTargetPhase();
}

// --- 3. 实验设置 ---
async function setup() {
    // 初始化 ExpPsyJS 应用
    const options = ExpPsyJS.defaultOptions;
    options.appOptions.width = 1600;
    options.appOptions.height = 900;
    options.appOptions.backgroundColor = 0x000000;
    exp = ExpPsyJS.createApplication(options);

    // 初始化UI组件
    instructionScreen = createTextDisplay(
        '欢迎您参加本次实验！\n本次实验由两个部分组成，当前为第一部分，需佩戴红蓝眼镜完成。\n当前部分包括练习阶段和正式实验阶段：\n' +
        '- 练习阶段不会记录您的实验数据，目的是让您熟悉实验流程\n' +
        '- 在正式实验阶段，屏幕底部会显示当前完成情况\n\n' +
        '【实验流程】\n' +
        '每个试次一开始会呈现黑屏，您需要先将鼠标缓慢移动到屏幕中央并保持稳定以启动实验\n' +
        '当中央区域的圆环完全变绿后，屏幕中央会出现十字注视点\n' +
        '随后会呈现一些刺激，之后会在屏幕上任意位置呈现一个靶子\n' +
        '请记住，您必须在看到靶子之后才能移动鼠标点击靶子\n' +
        '您的任务是尽量快速移动鼠标且准确地点击出现的靶子。\n' +
        '请您尽可能快速、准确地完成这个任务。\n' +
        '当您准备好后，请按【空格键】开始练习阶段。',
        28, 1000, 'center'
    );
    
    // 练习结束后的指导语
    practiceInstructionScreen = createTextDisplay(
        '练习阶段结束！\n\n' +
        '接下来将进入正式实验阶段，共30个block，每个block包含3次试次。\n\n' +
        '请您继续按照练习阶段的要求，尽可能快速、准确地完成任务。\n\n' +
        '屏幕底部会显示当前的进度条和完成情况。\n\n' +
        '当您准备好后，请按【空格键】开始正式实验。',
        28, 1000, 'center',
        false
    );
    
    fixationCross = new ExpPsyJS.UI.Shape.Cross({ 
        color: 0xFFFFFF,
        border: { width: 5 }, 
        size: 50 
    });
    fixationCross.visible = false;
    ExpPsyJS.moveToCenter(fixationCross, exp.screen);
    exp.stage.addChild(fixationCross);

    mouseStableIndicator = createMouseStableIndicator();
    cfsContainer = createCfsContainer();
    targetDisplay = createTargetDisplay();
    createProgressBar(); // 创建进度条

    restScreen = createTextDisplay('本组实验结束，请休息一下。\n\n准备好后，按【空格键】开始下一组实验', 40);
    debriefScreen = createTextDisplay('实验结束！\n\n感谢您的参与。\n\n数据正在保存中...', 40);

    // 初始化计时器
    timerFixation = new ExpPsyJS.Timer(FIXATION_DURATION_MS);
    timerMouseStable = new ExpPsyJS.Timer(REQUIRED_STABLE_DURATION);
    timerCfsPresentation = new ExpPsyJS.Timer(CFS_PRESENTATION_DURATION_MS);

    // 生成所有试次信息（包括练习试次和正式试次）
    let globalTrialCounter = 0;
    
    // 生成练习试次
    for (let block = 0; block < NUM_PRACTICE_BLOCKS; block++) {
        let conditionsInBlock = [...PRIME_CONDITIONS];
        conditionsInBlock.shuffle();

        for (let cond of conditionsInBlock) {
            globalTrialCounter++;

            arrAllTrials.push({
                globalTrialNum: globalTrialCounter,
                blockNum: block + 1,
                trialInBlockCondOrder: cond,
                primeCondition: cond,
                isPractice: true
            });
        }
    }
    
    // 生成正式实验试次
    for (let block = 0; block < NUM_MAIN_BLOCKS; block++) {
        let conditionsInBlock = [...PRIME_CONDITIONS];
        conditionsInBlock.shuffle();

        for (let cond of conditionsInBlock) {
            globalTrialCounter++;

            arrAllTrials.push({
                globalTrialNum: globalTrialCounter,
                blockNum: block + 1 + NUM_PRACTICE_BLOCKS, // 正式实验的block编号从4开始
                trialInBlockCondOrder: cond,
                primeCondition: cond,
                isPractice: false
            });
        }
    }
    
    console.log(`总共生成了 ${arrAllTrials.length} 个试次（${NUM_PRACTICE_BLOCKS * TRIALS_PER_BLOCK} 个练习试次，${NUM_MAIN_BLOCKS * TRIALS_PER_BLOCK} 个正式试次）。`);

    // 绑定计时器事件监听器
    timerFixation.on('end', startCfsPresentation);
    timerMouseStable.on('end', startFixationPhase);
    timerCfsPresentation.on('end', endCfsPresentation);

    // 加载CFS图片
    await loadCfsImages();
    
    showIntroduction();
}

// --- 4. 实验流程函数 ---

function showIntroduction() {
    console.log("显示实验指导语");
    instructionScreen.visible = true;
    keySpace = keyboard(" ");
    keySpace.press = async() => {
        keySpace.unsubscribe();
        instructionScreen.visible = false;
        
        if (typeof requestFullScreen === "function") requestFullScreen();
        
        await sleep(1000);
        
        startMouseCenterPhase();
    };
}

function showPracticeEndScreen() {
    practiceInstructionScreen.visible = true;
    keySpace = keyboard(" ");
    keySpace.press = async() => {
        keySpace.unsubscribe();
        practiceInstructionScreen.visible = false;
        
        if (typeof requestFullScreen === "function") requestFullScreen();
        
        await sleep(1000);
        
        startMouseCenterPhase();
    };
}

function runNextTrial() {
    fixationCross.visible = false;
    targetDisplay.style.display = 'none';
    
    if (cfsContainer) {
        cfsContainer.style.display = 'none';
    }
    
    if (timerCfsPresentation) timerCfsPresentation.stop();
    if (cfsMaskInterval) clearInterval(cfsMaskInterval);
    
    isMouseInCenter = false;
    mouseStableDuration = 0;
    mousePositions = [];
    
    // 更新进度条
    updateProgressBar();
    
    if (currentTrialIndex >= arrAllTrials.length) {
        endExperiment();
        return;
    }
    
    // 检查是否完成了所有练习试次
    if (currentTrialIndex === NUM_PRACTICE_BLOCKS * TRIALS_PER_BLOCK) {
        showPracticeEndScreen();
        return;
    }

    if (currentTrialIndex > 0 && currentTrialIndex % TRIALS_PER_BLOCK === 0) {
        showRestScreen();
        return;
    }
    
    console.log(`开始试次: ${currentTrialIndex + 1} / ${arrAllTrials.length}`);
    
    startMouseCenterPhase();
}

function showRestScreen() {
    restScreen.visible = true;
    keySpace = keyboard(" ");
    keySpace.press = () => {
        keySpace.unsubscribe();
        restScreen.visible = false;
        
        isMouseInCenter = false;
        mouseStableDuration = 0;
        mousePositions = [];
        
        startMouseCenterPhase();
    };
}

// 开始鼠标居中阶段
function startMouseCenterPhase() {
    console.log(performance.now(), "开始鼠标居中阶段");
    
    isMouseInCenter = false;
    mouseStableDuration = 0;
    mousePositions = [];
    
    updateMouseStableIndicator();
    
    document.addEventListener('mousemove', checkMousePosition);
}

// 检查鼠标是否在屏幕中心区域 - 主要修改点
function checkMousePosition(event) {
    // 使用window.innerWidth和window.innerHeight获取视口尺寸
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
    mousePositions.push({ x: mouseX, y: mouseY });
    if (mousePositions.length > STABILITY_SAMPLE_SIZE) {
        mousePositions.shift();
    }
    
    const distance = calculateDistance(mouseX, mouseY, centerX, centerY);
    
    if (distance <= CENTER_AREA_RADIUS) {
        if (!isMouseInCenter) {
            isMouseInCenter = true;
            console.log(performance.now(), "鼠标进入中心区域");
        }
        
        const isStable = calculateMouseStability();
        
        if (isStable) {
            if (mousePositions.length >= STABILITY_SAMPLE_SIZE) {
                mouseStableDuration += 16;
            }
            
            updateMouseStableIndicator();
            
            if (mouseStableDuration >= REQUIRED_STABLE_DURATION) {
                console.log(performance.now(), "鼠标在中心区域稳定达到所需时间");
                
                document.removeEventListener('mousemove', checkMousePosition);
                
                mouseStableIndicator.style.opacity = '0';
                
                setTimeout(() => {
                    startFixationPhase();
                }, 500);
            }
        } else {
            mouseStableDuration = 0;
            updateMouseStableIndicator();
        }
    } else {
        if (isMouseInCenter) {
            isMouseInCenter = false;
            mouseStableDuration = 0;
            console.log(performance.now(), "鼠标移出中心区域");
        }
        
        updateMouseStableIndicator();
    }
}

function startFixationPhase() {
    console.log(performance.now(), `开始注视阶段: trial ${currentTrialIndex + 1}`);
    fixationCross.visible = true;
    timerFixation.reset();
    timerFixation.start();
}

function startTargetPhase() {
    console.log(performance.now(), "开始靶子阶段");
    
    targetPosition = generateRandomTargetPosition();
    
    const targetSize = 300;
    targetDisplay.style.left = `${targetPosition.x - targetSize / 2}px`;
    targetDisplay.style.top = `${targetPosition.y - targetSize / 2}px`;
    targetDisplay.style.display = 'block';
    
    subjectResponded = false;
    targetOnsetTimestamp = performance.now();
    
    targetDisplay.addEventListener('click', handleTargetClick);
}

// 处理靶子点击事件
function handleTargetClick(event) {
    if (subjectResponded) return;
    
    subjectResponded = true;
    
    targetDisplay.removeEventListener('click', handleTargetClick);
    
    const rect = targetDisplay.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    const centerX = targetDisplay.width / 2 / (window.devicePixelRatio || 1);
    const centerY = targetDisplay.height / 2 / (window.devicePixelRatio || 1);
    
    const distance = calculateDistance(clickX, clickY, centerX, centerY);
    
    const responseTime = performance.now() - targetOnsetTimestamp;
    
    const trialData = arrAllTrials[currentTrialIndex];
    
    // 只记录正式实验的数据
    if (!trialData.isPractice) {
        arrResults.push({
            ...trialData,
            responseKey: 'click',
            rt: responseTime,
            distance: distance
        });
        
        console.log(`试次 ${currentTrialIndex + 1} 点击: 距离靶心 ${distance.toFixed(2)}px, RT: ${responseTime.toFixed(2)}ms`);
    }
    
    targetDisplay.style.display = 'none';
    
    currentTrialIndex++;
    
    runNextTrial();
}

async function endExperiment() {
    console.log("实验结束。");
    debriefScreen.visible = true;
    
    if (typeof exitFullScreen === "function") exitFullScreen();
    
    await sleep(500);

    try {
        if (typeof xlsExport === 'function') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `subliminal_priming_results_${timestamp}`;
            const xls = new xlsExport(arrResults, "实验结果");
            xls.exportToXLS(`${filename}.xls`);
            console.log("数据已导出为Excel文件。");
            debriefScreen.mesg += "\n\n数据已导出。";
        } else {
            console.warn("xlsExport 函数未找到。数据未自动导出。");
            debriefScreen.mesg += "\n\n数据导出功能未找到，请手动复制控制台中的数据。";
            console.log("--- 实验结果 ---");
            console.log(JSON.stringify(arrResults, null, 2)); 
        }
    } catch (e) {
        console.error("数据导出过程中发生错误:", e);
        debriefScreen.mesg += "\n\n数据导出时发生错误。";
    }
    
    await sleep(3000);
    if (exp && typeof exp.stop === 'function') {
        exp.stop();
    }
}

// --- 5. 启动实验 ---
document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
        console.error("严重错误: HTML中未找到 #root 元素。实验无法启动。");
        alert("严重错误: 未找到 #root 元素。请检查HTML文件。");
        return;
    }

    setup();

    if (exp && typeof exp.start === 'function') {
        exp.start();
    } else {
        console.error("ExpPsyJS 应用实例 (exp) 或 exp.start() 在 setup 后不可用。");
    }
});

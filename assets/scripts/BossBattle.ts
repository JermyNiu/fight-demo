import {
    _decorator,
    AudioClip,
    AudioSource,
    Button,
    Camera,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    input,
    Input,
    KeyCode,
    Label,
    Node,
    resources,
    sp,
    Sprite,
    SpriteFrame,
    tween,
    UITransform,
    Vec2,
    Vec3,
    VideoClip,
    VideoPlayer,
    view,
    ResolutionPolicy,
} from "cc";

const { ccclass } = _decorator;

const Config = {
    viewWidth: 1280,
    viewHeight: 720,
    mapWidth: 2560,
    battleY: 890,
    arenaLeft: 560,
    arenaRight: 2040,

    playerStartX: 900,
    playerSpeed: 260,
    playerRadius: 18,
    playerMaxHp: 100,
    playerAttackRange: 112,
    playerAttackDamage: 18,
    playerAttackCd: 0.55,
    playerAttackLock: 0.18,
    playerDodgeDistance: 210,
    playerDodgeCd: 0.95,
    playerDodgeTime: 0.16,
    playerDodgeInvulnTime: 0.34,

    bossStartX: 1280,
    bossStartY: 760,
    bossRadius: 66,
    bossMaxHp: 420,
    bossMoveSpeed: 170,
    bossKeepAwayRange: 136,
    bossVisualScale: 0.68,
    bossFinalTriggerRatio: 0.15,
    bossFinalLockHp: 1,

    bossThinkInterval: 0.35,
    bossNormalAiRange: 120,
    bossSkill1AiRange: 215,
    bossSkill3AiRange: 100,
    bossAttackCd: 2.2,
    bossSkill1Cd: 9.0,
    bossSkill3Cd: 4.6,
    bossAttackDamage: 24,
    bossSkill1Damage: 16,
    bossSkill3Damage: 56,

    qteTimes: [4.5, 5.45, 6.0, 6.5, 8.25, 9.4, 10.0, 11.45, 14.0],
    qteWindow: 0.30,
    qteBaseDamage: 10,
    qteDamageGrowth: 1.28,

    resultAnimFps: 8,
    resultVictoryFrames: 240,
    resultDefeatFrames: 120,
    menuAnimFps: 24,
    menuBackgroundFrameCount: 361,
};

interface LineHit {
    start: number;
    length: number;
    width: number;
    y: number;
    warning: number;
    impact: number;
}

const skill1Lines: LineHit[] = [
    { start: 80, length: 80, width: 160, y: -30, warning: 0.2, impact: 1.0 },
    { start: 170, length: 80, width: 160, y: -30, warning: 0.4, impact: 1.2 },
    { start: 260, length: 80, width: 160, y: -30, warning: 0.6, impact: 1.4 },
];

@ccclass("BossBattle")
export class BossBattle extends Component {
    private worldRoot: Node = null!;
    private fxRoot: Node = null!;
    private hudRoot: Node = null!;
    private loadingRoot: Node = null!;
    private loadingBarRoot: Node = null!;
    private loadingBarFill: Node = null!;
    private loadingLabel: Label = null!;
    private loadingStartButton: Node = null!;
    private menuRoot: Node = null!;
    private menuBackgroundSprite: Sprite = null!;
    private menuBackgroundFrames: SpriteFrame[] = [];
    private menuBackgroundElapsed = 0;
    private menuBackgroundFrameIndex = -1;
    private mainCamera: Camera | null = null;
    private settingsButtonSprite: Sprite | null = null;
    private settingsPanel: Node = null!;
    private resultRoot: Node = null!;
    private resultVideoNode: Node = null!;
    private resultVideo: VideoPlayer = null!;
    private resultSpriteNode: Node = null!;
    private resultSprite: Sprite = null!;
    private resultTitleLabel: Label = null!;
    private playerNode: Node = null!;
    private bossNode: Node = null!;
    private bossFallbackNode: Node | null = null;
    private bossSpine: sp.Skeleton | null = null;
    private availableBossAnims = new Map<string, string>();
    private warnedMissingBossAnims = new Set<string>();
    private audioSource: AudioSource = null!;

    private playerWorld = new Vec2(Config.playerStartX, Config.battleY);
    private bossWorld = new Vec2(Config.bossStartX, Config.bossStartY);
    private playerFacing = 1;
    private bossFacing = -1;

    private playerHp = Config.playerMaxHp;
    private bossHp = Config.bossMaxHp;
    private playerAttackCd = 0;
    private playerAttackLock = 0;
    private playerDodgeCd = 0;
    private playerDodgeTimer = 0;
    private playerInvulnTimer = 0;
    private playerDodgeDir = 1;

    private bossActionLock = 0;
    private bossThinkTimer = 0.35;
    private bossAttackCd = 0.6;
    private bossSkill1Cd = 4.2;
    private bossSkill3Cd = 1.8;
    private bossFinalUsed = false;
    private bossDeathLock = false;
    private bossFinalActive = false;

    private moveLeft = false;
    private moveRight = false;
    private resultShown = false;
    private qteOpen = false;
    private qteSuccess = false;
    private qteIndex = -1;
    private inMenu = false;
    private loadingAssets = true;
    private loadingReadyToStart = false;
    private loadingBaseLoaded = 0;
    private loadingBaseTotal = 8;
    private loadingMenuLoaded = 0;
    private loadingMenuTotal = Config.menuBackgroundFrameCount;
    private bootIntroPlayed = false;
    private introWatchedOnce = false;
    private introCanSkip = false;
    private victoryWatchedOnce = false;
    private defeatWatchedOnce = false;
    private resultCanSkip = false;
    private resultPlaying = false;
    private resultVictory = false;
    private resultElapsed = 0;
    private resultFrameIndex = -1;
    private resultFrameCount = 0;
    private resultFramePrefix = "";
    private resultUsesFrameSequence = false;
    private videoMode: "none" | "intro" | "result" = "none";
    private introDestination: "menu" | "battle" = "menu";

    private playerHpFill: Node = null!;
    private bossHpFill: Node = null!;
    private messageLabel: Label = null!;
    private qteLabel: Label = null!;
    private victoryClip: AudioClip | null = null;
    private defeatClip: AudioClip | null = null;
    private introVideoClip: VideoClip | null = null;
    private victoryVideoClip: VideoClip | null = null;
    private defeatVideoClip: VideoClip | null = null;

    onLoad(): void {
        view.setDesignResolutionSize(Config.viewWidth, Config.viewHeight, ResolutionPolicy.SHOW_ALL);
        this.ensureUI(this.node, Config.viewWidth, Config.viewHeight);
        this.audioSource = this.node.addComponent(AudioSource);
        this.mainCamera = this.node.getChildByName("Camera")?.getComponent(Camera) ?? null;
        this.buildScene();
        this.loadAssets();
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    update(dt: number): void {
        if (this.loadingAssets || this.loadingReadyToStart) return;
        if (this.videoMode !== "none") return;
        if (this.inMenu && this.menuRoot?.activeInHierarchy) {
            this.updateMenuBackground(dt);
        }
        if (this.resultShown) {
            if (this.resultPlaying) this.updateResultCinematic(dt);
            return;
        }
        if (this.inMenu) return;
        this.updatePlayer(dt);
        this.updateBoss(dt);
        this.updateHud();
        if (this.bossHp <= 0) {
            this.showResult(true);
        } else if (this.playerHp <= 0) {
            this.showResult(false);
        }
    }

    private buildScene(): void {
        this.worldRoot = this.makeNode("WorldRoot", this.node);
        this.fxRoot = this.makeNode("FxRoot", this.node);
        this.hudRoot = this.makeNode("HudRoot", this.node);

        const bg = this.makeNode("Background", this.worldRoot);
        this.ensureUI(bg, Config.viewWidth, Config.viewHeight);
        bg.addComponent(Sprite);

        this.drawBattleLine();
        this.playerNode = this.makeNode("Player", this.worldRoot);
        this.drawPlayer();
        this.bossNode = this.makeNode("Boss", this.worldRoot);
        this.drawBossFallback();
        this.buildHud();
        this.buildResultLayer();
        this.buildMenu();
        this.buildLoadingLayer();
        this.placeActors();
        this.setBattleVisible(false);
        this.menuRoot.active = false;
        this.setMenuCameraMode(true);
    }

    private buildLoadingLayer(): void {
        this.loadingRoot = this.makeNode("LoadingLayer", this.node);
        this.ensureUI(this.loadingRoot, Config.viewWidth, Config.viewHeight);
        this.drawRect(this.makeNode("LoadingBg", this.loadingRoot), Config.viewWidth, Config.viewHeight, new Color(5, 6, 8, 255));
        this.loadingLabel = this.createStandaloneLabel("LoadingText", this.loadingRoot, new Vec3(0, -284, 0), 30, "素材加载中...");
        this.loadingLabel.color = new Color(232, 226, 208, 255);
        this.loadingBarRoot = this.makeNode("LoadingBar", this.loadingRoot);
        this.loadingBarRoot.setPosition(0, -330, 0);
        this.drawRect(this.makeNode("LoadingBarBg", this.loadingBarRoot), 760, 18, new Color(45, 48, 54, 255));
        this.loadingBarFill = this.makeNode("LoadingBarFill", this.loadingBarRoot);
        this.loadingBarFill.setPosition(-380, 0, 0);
        this.ensureUI(this.loadingBarFill, 760, 18, 0, 0.5);
        const fillGraphics = this.loadingBarFill.addComponent(Graphics);
        fillGraphics.fillColor = new Color(172, 54, 42, 255);
        fillGraphics.rect(0, -9, 760, 18);
        fillGraphics.fill();
        this.loadingStartButton = this.createLoadingButton();
        this.loadingStartButton.active = false;
        this.setLoadingProgress(0);
    }

    private createLoadingButton(): Node {
        const button = this.makeNode("StartGameButton", this.loadingRoot);
        button.setPosition(0, -72, 0);
        this.drawRect(button, 240, 58, new Color(134, 28, 24, 245));
        const labelNode = this.makeNode("StartGameButtonLabel", button);
        this.ensureUI(labelNode, 240, 58);
        const label = labelNode.addComponent(Label);
        label.string = "开始游戏";
        label.fontSize = 28;
        label.lineHeight = 36;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 238, 196, 255);
        button.addComponent(Button);
        button.on(Node.EventType.TOUCH_START, this.onLoadingStartClicked, this);
        return button;
    }

    private loadAssets(): void {
        let loaded = 0;
        const total = 9;
        const markLoaded = () => {
            loaded += 1;
            this.loadingBaseLoaded = Math.min(this.loadingBaseTotal, this.loadingBaseLoaded + 1);
            this.refreshLoadingProgress();
            if (loaded >= total) this.finishBootLoading();
        };
        const markMenuLoaded = () => {
            loaded += 1;
            this.loadingMenuLoaded = this.loadingMenuTotal;
            this.refreshLoadingProgress();
            if (loaded >= total) this.finishBootLoading();
        };

        resources.load("textures/combat/boss_challenge_bg/spriteFrame", SpriteFrame, (err, frame) => {
            if (err) {
                console.warn("Background load failed", err);
                markLoaded();
                return;
            }
            const sprite = this.worldRoot.getChildByName("Background")!.getComponent(Sprite)!;
            sprite.spriteFrame = frame;
            markLoaded();
        });

        resources.load("spine/boss_yipeiertaer/hero_yipeiertaer", sp.SkeletonData, (err, data) => {
            if (err) {
                console.warn("Boss Spine load failed", err);
                this.messageLabel.string = "Spine import pending";
                markLoaded();
                return;
            }
            if (this.bossFallbackNode) this.bossFallbackNode.active = false;
            const spineNode = this.makeNode("BossSpine", this.bossNode);
            this.ensureUI(spineNode, 420, 520);
            this.bossSpine = spineNode.addComponent(sp.Skeleton);
            this.bossSpine.skeletonData = data;
            this.bossSpine.premultipliedAlpha = false;
            this.cacheBossAnimations(data);
            this.playBossAnim("standby_loop", true);
            markLoaded();
        });

        resources.load("audio/boss_result/victory", AudioClip, (_err, clip) => {
            this.victoryClip = clip;
            markLoaded();
        });
        resources.load("audio/boss_result/defeat", AudioClip, (_err, clip) => {
            this.defeatClip = clip;
            markLoaded();
        });
        this.loadMenuBackgroundFrames(markMenuLoaded);
        resources.load("textures/ui_art/main_panel/settings_gear/spriteFrame", SpriteFrame, (err, frame) => {
            if (err) {
                console.warn("Settings gear load failed", err);
                markLoaded();
                return;
            }
            if (this.settingsButtonSprite && this.settingsButtonSprite.node.isValid) {
                this.settingsButtonSprite.spriteFrame = frame;
            }
            markLoaded();
        });
        resources.load("videos/boss_result/intro", VideoClip, (_err, clip) => {
            this.introVideoClip = clip;
            markLoaded();
        });
        resources.load("videos/boss_result/victory", VideoClip, (_err, clip) => {
            this.victoryVideoClip = clip;
            markLoaded();
        });
        resources.load("videos/boss_result/defeat", VideoClip, (_err, clip) => {
            this.defeatVideoClip = clip;
            markLoaded();
        });
    }

    private setLoadingProgress(value: number): void {
        if (!this.loadingBarFill) return;
        this.loadingBarFill.setScale(Math.max(0, Math.min(1, value)), 1, 1);
    }

    private refreshLoadingProgress(): void {
        const total = this.loadingBaseTotal + Math.max(1, this.loadingMenuTotal);
        const loaded = this.loadingBaseLoaded + Math.min(this.loadingMenuLoaded, this.loadingMenuTotal);
        this.setLoadingProgress(loaded / total);
    }

    private finishBootLoading(): void {
        if (!this.loadingAssets) return;
        this.loadingAssets = false;
        this.setLoadingProgress(1);
        this.loadingReadyToStart = true;
        this.loadingLabel.node.active = false;
        this.loadingBarRoot.active = false;
        this.loadingStartButton.active = true;
    }

    private onLoadingStartClicked(): void {
        if (!this.loadingReadyToStart) return;
        this.loadingReadyToStart = false;
        this.loadingRoot.active = false;
        this.playBootIntro();
    }

    private loadMenuBackgroundFrames(done?: () => void): void {
        resources.loadDir("textures/town/background_video_frames", SpriteFrame, (finished, total) => {
            this.loadingMenuTotal = Math.max(1, total || this.loadingMenuTotal);
            this.loadingMenuLoaded = Math.min(finished, this.loadingMenuTotal);
            this.refreshLoadingProgress();
        }, (err, frames) => {
            if (err) {
                console.warn("Menu background frames load failed", err);
                if (done) done();
                return;
            }
            this.menuBackgroundFrames = frames.sort((a, b) => a.name.localeCompare(b.name));
            this.loadingMenuTotal = Math.max(1, this.menuBackgroundFrames.length);
            this.loadingMenuLoaded = this.loadingMenuTotal;
            this.menuBackgroundElapsed = 0;
            this.menuBackgroundFrameIndex = -1;
            this.updateMenuBackground(0);
            if (done) done();
        });
    }

    private updatePlayer(dt: number): void {
        this.playerAttackCd = Math.max(0, this.playerAttackCd - dt);
        this.playerAttackLock = Math.max(0, this.playerAttackLock - dt);
        this.playerDodgeCd = Math.max(0, this.playerDodgeCd - dt);
        this.playerInvulnTimer = Math.max(0, this.playerInvulnTimer - dt);

        if (this.playerDodgeTimer > 0) {
            const speed = Config.playerDodgeDistance / Config.playerDodgeTime;
            this.playerWorld.x = this.clampWorldX(this.playerWorld.x + this.playerDodgeDir * speed * dt);
            this.playerDodgeTimer = Math.max(0, this.playerDodgeTimer - dt);
        } else if (this.playerAttackLock <= 0) {
            let dir = 0;
            if (this.moveLeft) dir -= 1;
            if (this.moveRight) dir += 1;
            if (dir !== 0) {
                this.playerFacing = dir;
                this.playerWorld.x = this.clampWorldX(this.playerWorld.x + dir * Config.playerSpeed * dt);
            }
        }
        this.playerNode.setScale(this.playerFacing, 1, 1);
        this.playerNode.setPosition(this.worldToView3(this.playerWorld));
    }

    private updateBoss(dt: number): void {
        if (this.bossHp <= 0) return;
        this.bossAttackCd = Math.max(0, this.bossAttackCd - dt);
        this.bossSkill1Cd = Math.max(0, this.bossSkill1Cd - dt);
        this.bossSkill3Cd = Math.max(0, this.bossSkill3Cd - dt);
        this.bossActionLock = Math.max(0, this.bossActionLock - dt);
        this.bossThinkTimer = Math.max(0, this.bossThinkTimer - dt);
        this.bossFacing = this.playerWorld.x >= this.bossWorld.x ? 1 : -1;

        if (this.bossActionLock <= 0 && !this.bossFinalActive) {
            const dist = Math.abs(this.playerWorld.x - this.bossWorld.x);
            if (this.bossThinkTimer <= 0) {
                if (this.bossSkill1Cd <= 0 && dist <= Config.bossSkill1AiRange) {
                    this.castSkill1();
                } else if (this.bossSkill3Cd <= 0 && dist <= Config.bossSkill3AiRange) {
                    this.castSkill3();
                } else if (this.bossAttackCd <= 0 && dist <= Config.bossNormalAiRange) {
                    this.castNormalAttack();
                } else {
                    this.bossThinkTimer = Config.bossThinkInterval;
                }
            }
            this.moveBoss(dt, dist);
        }

        this.bossNode.setScale(Config.bossVisualScale * this.bossFacing, Config.bossVisualScale, 1);
        this.bossNode.setPosition(this.worldToView3(this.bossWorld));
    }

    private moveBoss(dt: number, dist: number): void {
        const desired = this.bossSkill1Cd <= 0 ? Config.bossSkill1AiRange : Config.bossNormalAiRange;
        if (dist > desired + 12) {
            this.bossWorld.x = this.clampWorldX(this.bossWorld.x + this.bossFacing * Config.bossMoveSpeed * dt);
            this.playBossAnim("run_loop", true, "standby_loop");
        } else if (dist < Config.bossKeepAwayRange) {
            this.bossWorld.x = this.clampWorldX(this.bossWorld.x - this.bossFacing * Config.bossMoveSpeed * dt);
            this.playBossAnim("run_loop", true, "standby_loop");
        } else {
            this.playBossAnim("standby_loop", true);
        }
    }

    private onKeyDown(event: EventKeyboard): void {
        if (this.videoMode !== "none") {
            this.tryResumeVideo();
            return;
        }
        if (this.inMenu && (event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE)) {
            this.startGame();
            return;
        }
        if (this.inMenu || this.resultPlaying) return;
        if (event.keyCode === KeyCode.KEY_A || event.keyCode === KeyCode.ARROW_LEFT) this.moveLeft = true;
        if (event.keyCode === KeyCode.KEY_D || event.keyCode === KeyCode.ARROW_RIGHT) this.moveRight = true;
        if (event.keyCode === KeyCode.KEY_J) this.tryPlayerAttack();
        if (event.keyCode === KeyCode.KEY_K) {
            if (!this.tryQtePress()) {
                this.tryPlayerDodge();
            }
        }
    }

    private onKeyUp(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.KEY_A || event.keyCode === KeyCode.ARROW_LEFT) this.moveLeft = false;
        if (event.keyCode === KeyCode.KEY_D || event.keyCode === KeyCode.ARROW_RIGHT) this.moveRight = false;
    }

    private tryPlayerAttack(): void {
        if (this.playerAttackCd > 0 || this.playerDodgeTimer > 0 || this.playerHp <= 0) return;
        this.playerAttackCd = Config.playerAttackCd;
        this.playerAttackLock = Config.playerAttackLock;
        this.drawSlash();

        const dx = this.bossWorld.x - this.playerWorld.x;
        if (Math.abs(dx) <= Config.playerAttackRange + Config.bossRadius && Math.sign(dx || this.playerFacing) === this.playerFacing) {
            this.damageBoss(Config.playerAttackDamage);
            this.spawnLabel(String(Config.playerAttackDamage), this.worldToView3(this.bossWorld).add(new Vec3(0, 115, 0)), new Color(255, 230, 100, 255));
        }
    }

    private tryPlayerDodge(): void {
        if (this.playerDodgeCd > 0 || this.playerAttackLock > 0 || this.playerHp <= 0) return;
        let dir = 0;
        if (this.moveLeft) dir -= 1;
        if (this.moveRight) dir += 1;
        this.playerDodgeDir = dir || this.playerFacing;
        this.playerFacing = this.playerDodgeDir;
        this.playerDodgeCd = Config.playerDodgeCd;
        this.playerDodgeTimer = Config.playerDodgeTime;
        this.playerInvulnTimer = Config.playerDodgeInvulnTime;
        this.spawnRing(this.playerNode.position, 34, new Color(80, 220, 255, 220), 0.2);
    }

    private damageBoss(amount: number): void {
        if (this.bossDeathLock) {
            this.bossHp = Math.max(Config.bossFinalLockHp, this.bossHp - amount);
            return;
        }
        const nextHp = Math.max(0, this.bossHp - amount);
        if (!this.bossFinalUsed && nextHp > 0 && nextHp / Config.bossMaxHp <= Config.bossFinalTriggerRatio) {
            this.bossHp = Config.bossFinalLockHp;
            this.castFinalSkill();
            return;
        }
        this.bossHp = nextHp;
        if (this.bossHp > 0) this.playBossAnim("pohuai_hit", false, "standby_loop");
    }

    private damagePlayer(amount: number): void {
        if (this.playerInvulnTimer > 0 || this.playerHp <= 0) return;
        this.playerHp = Math.max(0, this.playerHp - amount);
        this.spawnLabel(String(Math.round(amount)), this.playerNode.position.add(new Vec3(0, 58, 0)), new Color(255, 85, 70, 255));
    }

    private castNormalAttack(): void {
        this.bossAttackCd = Config.bossAttackCd;
        this.bossThinkTimer = 1.7;
        this.bossActionLock = 1.65;
        this.playBossAnim("attack", false, "standby_loop");
        const center = new Vec2(this.bossWorld.x + this.bossFacing * 60, this.bossWorld.y + 40);
        this.spawnRectWarning(center, 120, 60, 1.3, () => {
            if (Math.abs(this.playerWorld.x - center.x) <= 60 + Config.playerRadius && Math.abs(this.playerWorld.y - center.y) <= 30 + Config.playerRadius) {
                this.damagePlayer(Config.bossAttackDamage);
            }
        });
    }

    private castSkill1(): void {
        this.bossSkill1Cd = Config.bossSkill1Cd;
        this.bossThinkTimer = 2.2;
        this.bossActionLock = 1.45;
        this.playBossAnim("skill1", false, "standby_loop");
        for (const line of skill1Lines) {
            this.scheduleOnce(() => {
                const center = new Vec2(this.bossWorld.x + this.bossFacing * (line.start + line.length * 0.5), this.bossWorld.y + line.y);
                this.spawnRectWarning(center, line.length, line.width, line.impact - line.warning, () => {
                    if (Math.abs(this.playerWorld.x - center.x) <= line.length * 0.5 + Config.playerRadius && Math.abs(this.playerWorld.y - center.y) <= line.width * 0.5 + Config.playerRadius) {
                        this.damagePlayer(Config.bossSkill1Damage);
                    }
                });
            }, line.warning);
        }
    }

    private castSkill3(): void {
        this.bossSkill3Cd = Config.bossSkill3Cd;
        this.bossThinkTimer = 3.0;
        this.bossActionLock = 1.8;
        this.playBossAnim("wujiandiyu_effect", false, "standby_loop");
        const target = new Vec2(this.bossWorld.x + -100 * -this.bossFacing, this.bossWorld.y + 30);
        this.spawnCircleWarning(target, 40, 0.92, () => {
            if (Vec2.distance(this.playerWorld, target) <= 40 + Config.playerRadius) {
                this.damagePlayer(Config.bossSkill3Damage);
            }
            this.playBossAnim("wujiandiyu", false, "standby_loop");
        });
    }

    private castFinalSkill(): void {
        this.bossFinalUsed = true;
        this.bossDeathLock = true;
        this.bossFinalActive = true;
        this.bossActionLock = 15.2;
        this.playBossAnim("skill2", false, "standby_loop");
        Config.qteTimes.forEach((time, index) => {
            const damage = Config.qteBaseDamage * Math.pow(Config.qteDamageGrowth, index);
            this.scheduleOnce(() => this.openQte(index, damage), time);
        });
        const last = Config.qteTimes[Config.qteTimes.length - 1];
        this.scheduleOnce(() => {
            this.bossFinalActive = false;
            this.bossDeathLock = false;
            this.qteLabel.node.active = false;
        }, last + Config.qteWindow + 0.55);
    }

    private openQte(index: number, damage: number): void {
        this.qteOpen = true;
        this.qteSuccess = false;
        this.qteIndex = index;
        this.qteLabel.string = "K";
        this.qteLabel.node.active = true;
        this.scheduleOnce(() => {
            if (this.qteOpen && this.qteIndex === index) {
                this.qteOpen = false;
                this.qteLabel.node.active = false;
                if (!this.qteSuccess) this.damagePlayer(damage);
            }
        }, Config.qteWindow);
    }

    private tryQtePress(): boolean {
        if (!this.qteOpen) return false;
        this.qteSuccess = true;
        this.qteOpen = false;
        this.qteIndex = -1;
        this.playerInvulnTimer = Math.max(this.playerInvulnTimer, Config.playerDodgeInvulnTime);
        this.playerDodgeCd = 0;
        this.qteLabel.string = "OK";
        this.scheduleOnce(() => this.qteLabel.node.active = false, 0.12);
        return true;
    }

    private playBossAnim(name: string, loop: boolean, fallback?: string): void {
        if (!this.bossSpine) return;
        const runtimeName = this.resolveBossAnimName(name);
        if (!runtimeName && fallback) {
            this.playBossAnim(fallback, true);
            return;
        }
        if (!runtimeName) {
            this.warnMissingBossAnim(name);
            return;
        }
        if (this.bossSpine.animation === runtimeName) return;
        try {
            this.bossSpine.setAnimation(0, runtimeName, loop);
            const fallbackName = fallback ? this.resolveBossAnimName(fallback) : "";
            if (!loop && fallbackName) this.bossSpine.addAnimation(0, fallbackName, true, 0);
        } catch {
            this.warnMissingBossAnim(name);
        }
    }

    private cacheBossAnimations(data: sp.SkeletonData): void {
        this.availableBossAnims.clear();
        const runtimeData = data.getRuntimeData(true);
        for (const anim of runtimeData?.animations ?? []) {
            const name = String(anim.name ?? "");
            this.availableBossAnims.set(name, name);
            this.availableBossAnims.set(this.cleanAnimName(name), name);
        }
        console.log(`Boss Spine animations: ${Array.from(new Set(this.availableBossAnims.values())).join(", ")}`);
    }

    private warnMissingBossAnim(name: string): void {
        if (this.warnedMissingBossAnims.has(name)) return;
        this.warnedMissingBossAnims.add(name);
        console.warn(`Missing boss animation: ${name}`);
    }

    private resolveBossAnimName(name: string): string {
        return this.availableBossAnims.get(name) || this.availableBossAnims.get(this.cleanAnimName(name)) || "";
    }

    private cleanAnimName(name: string): string {
        return name.replace(/[\x00-\x1F\x7F]/g, "");
    }

    private buildHud(): void {
        this.playerHpFill = this.createBar("PlayerHp", new Vec3(-410, 324, 0), new Color(50, 190, 80, 255), false);
        this.bossHpFill = this.createBar("BossHp", new Vec3(410, 324, 0), new Color(210, 35, 45, 255), true);
        this.messageLabel = this.createLabel("Message", new Vec3(0, 245, 0), 34, "");
        this.qteLabel = this.createLabel("Qte", new Vec3(0, 105, 0), 96, "");
        this.qteLabel.node.active = false;
        this.createLabel("Hint", new Vec3(0, -325, 0), 20, "A/D move   J attack   K dodge/QTE");
    }

    private buildMenu(): void {
        this.menuRoot = this.makeNode("MainMenu", this.node);
        this.ensureUI(this.menuRoot, Config.viewWidth, Config.viewHeight);
        const backgroundNode = this.makeNode("TownBackgroundFrames", this.menuRoot);
        this.ensureUI(backgroundNode, Config.viewWidth, Config.viewHeight);
        this.menuBackgroundSprite = backgroundNode.addComponent(Sprite);
        this.menuBackgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const portal = this.makeNode("PortalHotspot", this.menuRoot);
        portal.setPosition(30, -20, 0);
        this.ensureUI(portal, 330, 500);
        portal.addComponent(Button);
        portal.on(Button.EventType.CLICK, this.startGame, this);

        const settingsButton = this.makeNode("SettingsButton", this.menuRoot);
        settingsButton.setPosition(580, 300, 0);
        this.ensureUI(settingsButton, 78, 78);
        this.drawRect(settingsButton, 78, 78, new Color(0, 0, 0, 1));
        settingsButton.addComponent(Button);
        settingsButton.on(Node.EventType.TOUCH_END, this.toggleSettingsPanel, this);

        const settingsIcon = this.makeNode("SettingsGear", settingsButton);
        this.ensureUI(settingsIcon, 58, 58);
        const iconSprite = settingsIcon.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.settingsButtonSprite = iconSprite;

        this.buildSettingsPanel();
    }

    private updateMenuBackground(dt: number): void {
        if (!this.menuBackgroundSprite || this.menuBackgroundFrames.length === 0) return;
        this.menuBackgroundElapsed += dt;
        const index = Math.floor(this.menuBackgroundElapsed * Config.menuAnimFps) % this.menuBackgroundFrames.length;
        if (index === this.menuBackgroundFrameIndex) return;
        this.menuBackgroundFrameIndex = index;
        this.menuBackgroundSprite.spriteFrame = this.menuBackgroundFrames[index];
    }

    private buildSettingsPanel(): void {
        this.settingsPanel = this.makeNode("SettingsPanel", this.menuRoot);
        this.settingsPanel.setPosition(0, 0, 0);
        this.ensureUI(this.settingsPanel, Config.viewWidth, Config.viewHeight);
        this.drawRect(this.makeNode("SettingsDim", this.settingsPanel), Config.viewWidth, Config.viewHeight, new Color(0, 0, 0, 132));
        this.drawRect(this.makeNode("SettingsBg", this.settingsPanel), 380, 300, new Color(28, 20, 18, 238));
        const title = this.createMenuLabel("SettingsTitle", new Vec3(0, 92, 0), 28, "设置");
        title.node.parent = this.settingsPanel;
        title.node.setPosition(0, 92, 0);
        const replay = this.createButton("ReplayIntroBtn", new Vec3(0, 28, 0), 220, 44, "重播开场");
        replay.parent = this.settingsPanel;
        replay.setPosition(0, 28, 0);
        replay.on(Button.EventType.CLICK, this.replayIntroFromSettings, this);
        const challenge = this.createButton("ChallengeBtn", new Vec3(0, -34, 0), 220, 44, "进入挑战");
        challenge.parent = this.settingsPanel;
        challenge.setPosition(0, -34, 0);
        challenge.on(Button.EventType.CLICK, this.startGame, this);
        const close = this.createButton("CloseSettingsBtn", new Vec3(0, -96, 0), 220, 44, "关闭");
        close.parent = this.settingsPanel;
        close.setPosition(0, -96, 0);
        close.on(Button.EventType.CLICK, this.toggleSettingsPanel, this);
        this.settingsPanel.active = false;
    }

    private toggleSettingsPanel(): void {
        this.settingsPanel.active = !this.settingsPanel.active;
        this.settingsPanel.setSiblingIndex(this.menuRoot.children.length - 1);
    }

    private replayIntroFromSettings(): void {
        if (this.settingsPanel) this.settingsPanel.active = false;
        this.menuRoot.active = false;
        this.playIntroCinematic("menu");
    }

    private loadSprite(node: Node, path: string): void {
        resources.load(path, SpriteFrame, (err, frame) => {
            if (err || !frame || !node.isValid) return;
            const sprite = node.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = frame;
        });
    }

    private createMenuLabel(name: string, pos: Vec3, size: number, text: string): Label {
        const node = this.makeNode(name, this.menuRoot);
        node.setPosition(pos);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.ceil(size * 1.18);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.color = new Color(232, 226, 208, 255);
        return label;
    }

    private createButton(name: string, pos: Vec3, width: number, height: number, text: string): Node {
        const node = this.makeNode(name, this.menuRoot);
        node.setPosition(pos);
        this.drawRect(node, width, height, new Color(134, 28, 24, 245));
        const labelNode = this.makeNode(`${name}Label`, node);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 26;
        label.lineHeight = 34;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 238, 196, 255);
        this.ensureUI(labelNode, width, height);
        node.addComponent(Button);
        return node;
    }

    private buildResultLayer(): void {
        this.resultRoot = this.makeNode("ResultLayer", this.node);
        this.ensureUI(this.resultRoot, Config.viewWidth, Config.viewHeight);
        const spriteNode = this.makeNode("ResultFrames", this.resultRoot);
        this.ensureUI(spriteNode, Config.viewWidth, Config.viewHeight);
        this.resultSprite = spriteNode.addComponent(Sprite);
        this.resultSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.resultSpriteNode = spriteNode;
        this.resultSpriteNode.on(Node.EventType.TOUCH_END, this.onVideoTouched, this);
        this.resultVideoNode = this.makeNode("ResultVideo", this.resultRoot);
        this.ensureUI(this.resultVideoNode, Config.viewWidth, Config.viewHeight);
        this.resultVideo = this.resultVideoNode.addComponent(VideoPlayer);
        this.resultVideo.keepAspectRatio = true;
        this.resultVideo.loop = false;
        this.resultVideo.playOnAwake = false;
        this.resultVideo.volume = 1;
        this.resultVideoNode.on(VideoPlayer.EventType.COMPLETED, this.onVideoCompleted, this);
        this.resultVideoNode.on(VideoPlayer.EventType.ERROR, this.onVideoError, this);
        this.resultVideoNode.on(Node.EventType.TOUCH_END, this.onVideoTouched, this);
        this.resultTitleLabel = this.createLabel("ResultTitle", new Vec3(0, 0, 0), 54, "");
        this.resultTitleLabel.node.parent = this.resultRoot;
        this.resultTitleLabel.node.active = false;
        this.resultVideoNode.active = false;
        this.resultSpriteNode.active = false;
        this.resultRoot.active = false;
    }

    private updateHud(): void {
        this.playerHpFill.setScale(Math.max(0, this.playerHp / Config.playerMaxHp), 1, 1);
        this.bossHpFill.setScale(Math.max(0, this.bossHp / Config.bossMaxHp), 1, 1);
        this.playerNode.active = this.playerInvulnTimer <= 0 || Math.floor(Date.now() / 80) % 2 === 0;
    }

    private createBar(name: string, pos: Vec3, color: Color, reverse: boolean): Node {
        const root = this.makeNode(name, this.hudRoot);
        root.setPosition(pos);
        this.drawRect(this.makeNode("Bg", root), 360, 18, new Color(20, 20, 25, 220));
        const fill = this.makeNode("Fill", root);
        fill.setPosition(reverse ? 180 : -180, 0, 0);
        this.ensureUI(fill, 360, 18, reverse ? 1 : 0, 0.5);
        const graphics = fill.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(reverse ? -360 : 0, -9, 360, 18);
        graphics.fill();
        return fill;
    }

    private createLabel(name: string, pos: Vec3, size: number, text: string): Label {
        const node = this.makeNode(name, this.hudRoot);
        node.setPosition(pos);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.ceil(size * 1.15);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        return label;
    }

    private createStandaloneLabel(name: string, parent: Node, pos: Vec3, size: number, text: string): Label {
        const node = this.makeNode(name, parent);
        node.setPosition(pos);
        this.ensureUI(node, Config.viewWidth, Math.ceil(size * 1.4));
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.ceil(size * 1.18);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private drawPlayer(): void {
        this.ensureUI(this.playerNode, 80, 110);
        const g = this.playerNode.addComponent(Graphics);
        g.fillColor = new Color(70, 210, 255, 255);
        g.circle(0, 20, 16);
        g.rect(-14, -28, 28, 48);
        g.fill();
    }

    private drawBossFallback(): void {
        this.bossFallbackNode = this.makeNode("BossFallback", this.bossNode);
        this.ensureUI(this.bossFallbackNode, 160, 220);
        const g = this.bossFallbackNode.addComponent(Graphics);
        g.fillColor = new Color(190, 40, 60, 255);
        g.ellipse(0, 20, 48, 86);
        g.fill();
    }

    private drawBattleLine(): void {
        const line = this.makeNode("BattleLine", this.fxRoot);
        const g = line.addComponent(Graphics);
        const y = this.worldToView(new Vec2(0, Config.battleY)).y;
        g.strokeColor = new Color(120, 200, 220, 130);
        g.lineWidth = 2;
        g.moveTo(-Config.viewWidth * 0.5, y);
        g.lineTo(Config.viewWidth * 0.5, y);
        g.stroke();
    }

    private drawSlash(): void {
        const slash = this.makeNode("Slash", this.fxRoot);
        slash.setPosition(this.playerNode.position.x + this.playerFacing * 56, this.playerNode.position.y + 18, 0);
        const g = slash.addComponent(Graphics);
        g.strokeColor = new Color(180, 240, 255, 255);
        g.lineWidth = 5;
        g.arc(0, 0, 48, -0.8, 0.8, false);
        g.stroke();
        tween(slash).to(0.18, { scale: new Vec3(1.12, 1.12, 1) }).call(() => slash.destroy()).start();
    }

    private spawnRectWarning(world: Vec2, width: number, height: number, delay: number, hit: () => void): void {
        const node = this.makeNode("RectWarning", this.fxRoot);
        node.setPosition(this.worldToView3(world));
        this.drawRect(node, width, height, new Color(255, 28, 16, 72));
        this.scheduleOnce(() => {
            node.destroy();
            this.drawRect(this.makeNode("RectHit", this.fxRoot), width, height, new Color(255, 20, 10, 155), this.worldToView3(world), 0.22);
            hit();
        }, Math.max(0, delay));
    }

    private spawnCircleWarning(world: Vec2, radius: number, delay: number, hit: () => void): void {
        const node = this.makeNode("CircleWarning", this.fxRoot);
        node.setPosition(this.worldToView3(world));
        const g = node.addComponent(Graphics);
        g.fillColor = new Color(255, 28, 16, 72);
        g.circle(0, 0, radius);
        g.fill();
        this.scheduleOnce(() => {
            node.destroy();
            this.spawnRing(this.worldToView3(world), radius, new Color(255, 30, 18, 180), 0.8);
            hit();
        }, Math.max(0, delay));
    }

    private drawRect(node: Node, width: number, height: number, color: Color, pos?: Vec3, life = 0): void {
        if (pos) node.setPosition(pos);
        this.ensureUI(node, width, height);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-width * 0.5, -height * 0.5, width, height);
        g.fill();
        if (life > 0) this.scheduleOnce(() => node.destroy(), life);
    }

    private spawnRing(pos: Vec3, radius: number, color: Color, life: number): void {
        const node = this.makeNode("Ring", this.fxRoot);
        node.setPosition(pos);
        const g = node.addComponent(Graphics);
        g.strokeColor = color;
        g.lineWidth = 4;
        g.circle(0, 0, radius);
        g.stroke();
        tween(node).to(life, { scale: new Vec3(1.35, 1.35, 1) }).call(() => node.destroy()).start();
    }

    private spawnLabel(text: string, pos: Vec3, color: Color): void {
        const label = this.createLabel("FloatText", pos, 24, text);
        label.node.parent = this.fxRoot;
        label.node.setPosition(pos);
        label.node.getComponent(Label)!.color = color;
        tween(label.node).to(0.42, { position: pos.clone().add(new Vec3(0, 34, 0)) }).call(() => label.node.destroy()).start();
    }

    private showResult(victory: boolean): void {
        this.resultShown = true;
        this.messageLabel.string = "";
        this.startResultCinematic(victory);
    }

    private startGame(): void {
        this.setMenuCameraMode(false);
        this.menuRoot.active = false;
        this.enterBattle();
    }

    private enterBattle(): void {
        this.inMenu = false;
        this.resultShown = false;
        this.resultPlaying = false;
        this.videoMode = "none";
        this.resultRoot.active = false;
        this.resultTitleLabel.node.active = false;
        this.resultSpriteNode.active = true;
        this.resultVideoNode.active = false;
        this.setBattleVisible(true);
        this.resetBattle();
    }

    private resetBattle(): void {
        this.playerWorld.set(Config.playerStartX, Config.battleY);
        this.bossWorld.set(Config.bossStartX, Config.bossStartY);
        this.playerFacing = 1;
        this.bossFacing = -1;
        this.playerHp = Config.playerMaxHp;
        this.bossHp = Config.bossMaxHp;
        this.playerAttackCd = 0;
        this.playerAttackLock = 0;
        this.playerDodgeCd = 0;
        this.playerDodgeTimer = 0;
        this.playerInvulnTimer = 0;
        this.bossActionLock = 0;
        this.bossThinkTimer = 0.35;
        this.bossAttackCd = 0.6;
        this.bossSkill1Cd = 4.2;
        this.bossSkill3Cd = 1.8;
        this.bossFinalUsed = false;
        this.bossDeathLock = false;
        this.bossFinalActive = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.qteOpen = false;
        this.qteLabel.node.active = false;
        this.messageLabel.string = "";
        this.placeActors();
        this.updateHud();
        this.playBossAnim("standby_loop", true);
    }

    private setBattleVisible(visible: boolean): void {
        this.worldRoot.active = visible;
        this.fxRoot.active = visible;
        this.hudRoot.active = visible;
    }

    private playBootIntro(): void {
        this.bootIntroPlayed = true;
        this.playIntroCinematic("menu");
    }

    private playIntroCinematic(destination: "menu" | "battle"): void {
        this.introDestination = destination;
        this.introCanSkip = this.introWatchedOnce;
        this.resultRoot.active = true;
        this.resultTitleLabel.node.active = false;
        this.resultSpriteNode.active = false;
        this.resultVideoNode.active = false;
        this.videoMode = "intro";
        if (!this.introVideoClip) {
            this.finishIntroDestination();
            return;
        }
        this.resultVideo.clip = this.introVideoClip;
        this.resultVideo.mute = false;
        this.resultVideo.volume = 1;
        this.resultVideoNode.active = true;
        this.resultVideo.play();
        this.scheduleOnce(() => this.tryResumeVideo(), 0.08);
        this.scheduleOnce(() => this.tryResumeVideo(), 0.35);
        this.scheduleOnce(() => this.finishIntroDestination(), 20.2);
    }

    private startResultCinematic(victory: boolean): void {
        this.resultVictory = victory;
        this.resultCanSkip = victory ? this.victoryWatchedOnce : this.defeatWatchedOnce;
        this.resultPlaying = true;
        this.resultElapsed = 0;
        this.resultFrameIndex = -1;
        this.resultFrameCount = victory ? Config.resultVictoryFrames : Config.resultDefeatFrames;
        this.resultFramePrefix = `videos/boss_result/${victory ? "victory" : "defeat"}/frame_`;
        this.resultRoot.active = true;
        this.resultTitleLabel.node.active = false;
        this.resultSpriteNode.active = false;
        this.resultVideoNode.active = false;
        this.resultUsesFrameSequence = false;
        this.videoMode = "result";
        const clip = victory ? this.victoryVideoClip : this.defeatVideoClip;
        if (!clip) {
            this.startResultFrameSequence();
            return;
        }
        this.resultVideo.clip = clip;
        this.resultVideo.mute = false;
        this.resultVideo.volume = 1;
        this.resultVideoNode.active = true;
        this.resultVideo.play();
        this.scheduleOnce(() => this.tryResumeVideo(), 0.08);
        this.scheduleOnce(() => this.finishResultCinematic(), victory ? 30.2 : 15.2);
    }

    private tryResumeVideo(): void {
        if (this.videoMode === "none" || !this.resultVideoNode.active) return;
        this.resultVideo.play();
    }

    private onVideoTouched(): void {
        if (this.videoMode === "intro" && this.introCanSkip) {
            this.finishIntroDestination();
            return;
        }
        if (this.videoMode === "result" && this.resultCanSkip) {
            this.finishResultCinematic();
            return;
        }
        this.tryResumeVideo();
    }

    private updateResultCinematic(dt: number): void {
        if (!this.resultUsesFrameSequence) return;
        this.resultElapsed += dt;
        const nextFrame = Math.min(this.resultFrameCount - 1, Math.floor(this.resultElapsed * Config.resultAnimFps));
        if (nextFrame !== this.resultFrameIndex) this.loadResultFrame(nextFrame);
        if (this.resultElapsed >= this.resultFrameCount / Config.resultAnimFps) this.finishResultCinematic();
    }

    private onVideoCompleted(): void {
        if (this.videoMode === "intro") {
            this.finishIntroDestination();
            return;
        }
        if (this.videoMode === "result") this.finishResultCinematic();
    }

    private onVideoError(): void {
        if (this.videoMode === "intro") {
            this.finishIntroDestination();
            return;
        }
        if (this.videoMode === "result") this.startResultFrameSequence();
    }

    private finishIntroDestination(): void {
        if (this.videoMode !== "intro") return;
        this.videoMode = "none";
        this.introWatchedOnce = true;
        this.introCanSkip = false;
        this.resultVideo.stop();
        this.resultRoot.active = false;
        if (this.introDestination === "battle") {
            this.enterBattle();
        } else {
            this.showMainMenu();
        }
    }

    private showMainMenu(): void {
        this.setBattleVisible(false);
        this.setMenuCameraMode(true);
        this.menuRoot.active = true;
        this.menuBackgroundElapsed = 0;
        this.menuBackgroundFrameIndex = -1;
        this.updateMenuBackground(0);
        this.inMenu = true;
        this.resultShown = false;
    }

    private startResultFrameSequence(): void {
        if (!this.resultPlaying) return;
        this.resultUsesFrameSequence = true;
        this.resultVideoNode.active = false;
        this.resultSpriteNode.active = true;
        this.resultElapsed = 0;
        this.resultFrameIndex = -1;
        const clip = this.resultVictory ? this.victoryClip : this.defeatClip;
        if (clip) this.audioSource.playOneShot(clip);
        this.loadResultFrame(0);
    }

    private loadResultFrame(index: number): void {
        this.resultFrameIndex = index;
        const frameNo = String(index + 1).padStart(4, "0");
        resources.load(`${this.resultFramePrefix}${frameNo}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (err || !this.resultPlaying || index !== this.resultFrameIndex) return;
            this.resultSprite.spriteFrame = frame;
        });
    }

    private finishResultCinematic(): void {
        if (!this.resultPlaying) return;
        if (this.resultVictory) {
            this.victoryWatchedOnce = true;
        } else {
            this.defeatWatchedOnce = true;
        }
        this.resultCanSkip = false;
        this.resultPlaying = false;
        this.videoMode = "none";
        this.audioSource.stop();
        this.resultVideo.stop();
        this.resultVideoNode.active = false;
        this.resultTitleLabel.string = this.resultVictory ? "挑战成功" : "挑战失败";
        this.resultTitleLabel.node.active = true;
        this.scheduleOnce(() => {
            this.resultRoot.active = false;
            this.showMainMenu();
        }, this.resultVictory ? 2.4 : 1.0);
    }

    private placeActors(): void {
        this.playerNode.setPosition(this.worldToView3(this.playerWorld));
        this.bossNode.setPosition(this.worldToView3(this.bossWorld));
    }

    private makeNode(name: string, parent: Node): Node {
        const node = new Node(name);
        node.parent = parent;
        return node;
    }

    private setMenuCameraMode(enabled: boolean): void {
        if (!this.mainCamera) return;
        this.mainCamera.clearColor = enabled ? new Color(0, 0, 0, 0) : new Color(0, 0, 0, 255);
    }

    private ensureUI(node: Node, width: number, height: number, anchorX = 0.5, anchorY = 0.5): UITransform {
        const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
        ui.setContentSize(width, height);
        ui.setAnchorPoint(anchorX, anchorY);
        return ui;
    }

    private worldToView(world: Vec2): Vec2 {
        return new Vec2(world.x - Config.viewWidth, Config.viewHeight - world.y);
    }

    private worldToView3(world: Vec2): Vec3 {
        const viewPos = this.worldToView(world);
        return new Vec3(viewPos.x, viewPos.y, 0);
    }

    private clampWorldX(x: number): number {
        return Math.max(Config.arenaLeft, Math.min(Config.arenaRight, x));
    }
}

local screenWidth = 1280
local barMaxHeight = 430
local barWidth = 35
local barX = screenWidth - barWidth - 30
local barY = 560
local barColor = "F5F5F5"
local barColorWarn = "FF2D00"

local fadeDuration = 0.6
local fadeTimer = 0
local fadeState = "none" -- "in", "out", or "none"

local timeLeft = 15
local isSpacePressed = false

local shaderName = "static"

luaDebugMode = true

addCharacterToList("charlieHide", "bf")
precacheImage("Eye")

function onCreate()
    makeLuaSprite("bg", "slendyBar", 1206.48, 120)
    scaleObject("bg", 0.5, 0.71)
    setObjectCamera("bg", "hud")
    addLuaSprite("bg", true)

    makeLuaSprite("timeBar", "", barX, barY - barMaxHeight)
    makeGraphic("timeBar", barWidth, barMaxHeight, barColor)
    setObjectCamera("timeBar", "hud")
    addLuaSprite("timeBar", true)

    makeLuaSprite("icon", "slendyBarIcon", 1195, 548)
    scaleObject("icon", 0.4, 0.4)
    setObjectCamera("icon", "hud")
    addLuaSprite("icon", true)

    makeLuaSprite("fadeImage", "screenFade", -50, 0)
    scaleObject("fadeImage", 0.7, 0.7)
    setObjectCamera("fadeImage", "hud")
    setProperty("fadeImage.alpha", 0)
    setBlendMode("fadeImage", "subtract")
    addLuaSprite("fadeImage", true)

    setProperty("gf.visible", false)
end

function updateFade(elapsed)
    if fadeState == "in" then
        fadeTimer = fadeTimer + elapsed
        local alpha = math.min(fadeTimer / fadeDuration, 1)
        setProperty("fadeImage.alpha", alpha)
        if alpha >= 1 then
            fadeTimer = 0
            fadeState = "out"
        end

    elseif fadeState == "out" then
        fadeTimer = fadeTimer + elapsed
        local alpha = math.max(1 - (fadeTimer / fadeDuration), 0)
        setProperty("fadeImage.alpha", alpha)
        if alpha <= 0 then
            fadeTimer = 0
            fadeState = "none"
        end
    end
end

function onUpdate(elapsed)
    isSpacePressed = getPropertyFromClass("flixel.FlxG", "keys.pressed.SPACE")
    local health = getProperty("health")

    if isSpacePressed and fadeState == "none" then
        fadeState = "in"
        fadeTimer = 0
        triggerEvent("Change Character", 0, "charlieHide")
    end

    if not isSpacePressed then
        triggerEvent("Change Character", 0, "charlie")
    end

    updateFade(elapsed)

    if isSpacePressed then
        if health > 0 then
            setProperty("health", health - 0.0007 * elapsed)
        end
        timeLeft = math.min(timeLeft + elapsed * 1, 15)

        if timeLeft >= 15 then
            timeLeft = 15 - 0.01 * elapsed
            setProperty("health", health - 0.04 * elapsed)
        end
    else
        timeLeft = math.max(timeLeft - elapsed * 1, 0)
    end

    if timeLeft <= 0.1 then
        timeLeft = 0.1
        setProperty("health", -5)
    end

    local barColorHex = (timeLeft <= 15 / 2) and barColorWarn or barColor
    local barHeight = (timeLeft / 15) * barMaxHeight

    setProperty("timeBar.color", getColorFromHex(barColorHex))
    setGraphicSize("timeBar", barWidth, barHeight)
    setProperty("timeBar.y", barY - barHeight)

    if timeLeft == 0.1 or inGameOver then
        addHaxeLibrary("Application", "lime.app")
        runHaxeCode([[
        Application.current.window.alert("GOT YOU.", ".");
        ]])
        os.exit()
    end
end

function opponentNoteHit()
    if isSpacePressed and timeLeft >= 15 - 0.1 then
        setProperty("health", getProperty("health") - 0.02)
    end
end

-- @TianaArts_ ^_^ !!
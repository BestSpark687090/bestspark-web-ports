function onCreate()

    makeLuaSprite('Sky', 'forest/sky', -814, -127)
    addLuaSprite('Sky', false)

    makeLuaSprite('Moon', 'forest/moon', 452, 369)
    setScrollFactor('Moon', 0.2, -0.6)
    addLuaSprite('Moon', false)
    setBlendMode()

    makeLuaSprite('Base', 'forest/ground', -876, -43)
    addLuaSprite('Base', false)

    makeLuaSprite('Fog', 'forest/fog', -678, -220)
    addLuaSprite('Fog', true)
    setBlendMode('Fog', 'screen')

    if lowQuality then
        removeLuaSprite('Fog', true)
    end
    
    -- Start the fade loop
    startFogFade()

end

-- Function to start the fog fade loop
function startFogFade()
    doTweenAlpha('fogFadeOut', 'Fog', 0, 2, 'linear')
end

-- Callback function for tweens
function onTweenCompleted(tag)

    if tag == 'fogFadeOut' then
        doTweenAlpha('fogFadeIn', 'Fog', 1, 2, 'linear')
    elseif tag == 'fogFadeIn' then
        doTweenAlpha('fogFadeOut', 'Fog', 0, 2, 'linear')
    end

end
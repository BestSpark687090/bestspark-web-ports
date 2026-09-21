function onCreate()
    makeAnimatedLuaSprite('Warn', 'eyeWarning', 300, 500)
    addAnimationByPrefix('Warn', 'idle', 'eye', 24, true)
    scaleObject('Warn', 0.6, 0.6)
    setObjectCamera('Warn', 'hud')
    doTweenAlpha('WarnAlph', 'Warn', 0, 0.3, 'linear')
    addLuaSprite('Warn', true)
end

function onStepHit()
    if curStep == 3 then
        doTweenY('In', 'Warn', -40, 1.6,'circOut')
        doTweenAlpha('WarnAlph', 'Warn', 1, 0.5, 'linear')
    end

    if curStep == 27 then 
        doTweenAlpha('WarnAlph', 'Warn', 0, 1, 'linear')
    end
    
    if curStep == 50 then
        removeLuaSprite('Warn')
    end
end
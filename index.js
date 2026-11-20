const express = require('express')
const axios = require('axios')
const cors = require('cors')
const app = express()
app.use(cors())
app.use(express.json())
const PORT = process.env.PORT || 3000

let klinesCache = []
let signalList = []
let drawLines = []

function calcEMA(arr, period) {
  const res = []
  let ema = arr[0]
  for(let i=0;i<arr.length;i++){
    ema = (arr[i] * 2/(period+1)) + ema * (1 - 2/(period+1))
    res.push(ema)
  }
  return res
}
function calcBOLL(arr, period=20) {
  const mid = []
  const upper = []
  const lower = []
  for(let i=0;i<arr.length;i++){
    if(i<period-1){mid.push(null);upper.push(null);lower.push(null);continue}
    const slice = arr.slice(i-period+1,i+1)
    const ma = slice.reduce((a,b)=>a+b,0)/period
    const std = Math.sqrt(slice.reduce((s,v)=>s+(v-ma)**2,0)/period)
    mid.push(ma)
    upper.push(ma+2*std)
    lower.push(ma-2*std)
  }
  return {mid,upper,lower}
}
function calcRSI(arr,period=14){
  const rsi=[]
  let gain=0,loss=0
  for(let i=1;i<arr.length;i++){
    const diff = arr[i]-arr[i-1]
    if(diff>0) gain+=diff
    else loss-=diff
    if(i<period){rsi.push(null);continue}
    const avgG = gain/period
    const avgL = loss/period
    const rs = avgL===0 ? 100 : avgG/avgL
    rsi.push(100 - 100/(1+rs))
    const oldDiff = arr[i-period+1] - arr[i-period]
    if(oldDiff>0) gain -= oldDiff
    else loss += oldDiff
  }
  return rsi
}
function calcATR(high,low,close,period=14){
  const atr=[]
  let trSum=0
  for(let i=0;i<close.length;i++){
    const tr1 = high[i]-low[i]
    const tr2 = Math.abs(high[i] - (i>0?close[i-1]:close[i]))
    const tr3 = Math.abs(low[i] - (i>0?close[i-1]:close[i]))
    const tr = Math.max(tr1,tr2,tr3)
    if(i<period){trSum+=tr;atr.push(null);continue}
    const a = trSum/period
    atr.push(a)
    trSum = trSum - trSum/period + tr
  }
  return atr
}

app.get('/api/klines',async (req,res)=>{
  try{
    const resp = await axios.get('https://api.gateio.ws/api/v4/spot/candlesticks',{
      params:{currency_pair:'ETH_USDT',interval:'15m',limit:120}
    })
    const raw = resp.data.map(item=>({
      time:Number(item[0]),open:Number(item[5]),high:Number(item[3]),low:Number(item[4]),close:Number(item[2]),vol:Number(item[6])
    }))
    klinesCache = raw
    const closeArr = raw.map(x=>x.close)
    const ema5 = calcEMA(closeArr,5)
    const ema20 = calcEMA(closeArr,20)
    const boll = calcBOLL(closeArr,20)
    const rsi = calcRSI(closeArr,14)
    const atr = calcATR(raw.map(x=>x.high),raw.map(x=>x.low),closeArr,14)

    const last = raw[raw.length-1]
    const lastEma5 = ema5[ema5.length-1]
    const lastEma20 = ema20[ema20.length-1]
    const lastRsi = rsi[rsi.length-1]
    const lastAtr = atr[atr.length-1]
    let score = 0
    if(lastEma5>lastEma20) score += 25
    if(lastRsi < 40) score += 15
    let signal = null
    if(score>=35 && lastAtr){
      const entry = last.close
      const sl = entry - lastAtr*1.5
      const tp1 = entry + lastAtr*1.5
      const tp2 = entry + lastAtr*3
      const tp3 = entry + lastAtr*5
      signal = {type:'long',entry,sl,tp1,tp2,tp3,score,time:Date.now()}
      signalList.push(signal)
    }
    res.json({klines:raw,ema5,ema20,boll,rsi,atr,signal})
  }catch(e){
    res.status(500).json({err:e.message})
  }
})
app.get('/api/signals',(req,res)=>res.json(signalList))
app.post('/api/draw/save',(req,res)=>{drawLines.push(req.body);res.json({ok:true})})
app.get('/api/draw/list',(req,res)=>res.json(drawLines))
app.get('/api/health',(req,res)=>res.json({ok:true}))

app.listen(PORT,()=>{
  console.log(`✅ Service running on port ${PORT}`)
})

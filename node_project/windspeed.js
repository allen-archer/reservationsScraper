const https = require('https')

const url = 'https://rucsoundings.noaa.gov/get_soundings.cgi?data_source=Op40&latest=latest&start_year=2022&start_month_name=Aug&start_mday=20&start_hour=17&start_min=0&n_hrs=18&fcst_len=shortest&airport=KLNS&text=Ascii%20text%20%28GSL%20format%29&hydrometeors=false&start=latest'

async function main(){
    await doRequest()
}

async function doRequest(){
    const request = https.request(url, (response) => {
        let data = ''
        response.on('data', (chunk) => {
            data = data + chunk.toString()
        })
        response.on('end', () => {
            parse(data).then(table => {
                for (let i = 0; i < table.length; i++){
                    console.log('--------------------- set ' + i + ' ---------------------')
                    console.log(table[i])
                    console.log('     ')
                }
            })
        })
    })
    request.on('error', (error) => {
        console.error(error)
    })
    request.end()
}

async function parse(data){
    const layerSize = 100
    const maxElevation = 3000
    const split = data.split('\n')
    let table = []
    let newSet = true
    let surface
    let group = []
    let nextLayer = 0
    const header = ['elev', 'temp', 'head', 'mph']
    for (let i = 0; i < split.length; i++){
        let lineSplit = split[i].trim().split(/ +/)
        let first = lineSplit[0]
        if (first === '' || isNaN(first)){
            if (!newSet){
                newSet = true
                table.push(group)
            } else {
                group = []
            }
        } else {
            if (first <= 3){
                continue
            }
            if (first === '9'){
                newSet = false
                nextLayer = 0
                surface = lineSplit[2]
                group.push(header)
            }
            let elevation = lineSplit[2] - surface
            if (elevation <= maxElevation && elevation >= nextLayer) {
                group.push(await generateRow(lineSplit, elevation))
                nextLayer = elevation + layerSize
            }
        }
    }
    return table
}

async function generateRow(arr, elevation){
    let row = []
    row.push(elevation)
    row.push(await convertTemp(arr[3]))
    row.push(Number(arr[5]))
    row.push(await convertKnots(arr[6]))
    return row
}

async function convertTemp(temp){
    return Math.round(((temp / 10) * 1.8) + 32)
}

async function convertKnots(speed){
    return Math.round(speed * 1.151)
}

main().then()
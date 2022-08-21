const https = require('https')

const url = 'https://rucsoundings.noaa.gov/get_soundings.cgi?data_source=Op40&latest=latest&n_hrs=18&fcst_len=shortest&airport=KLNS&text=Ascii%20text%20%28GSL%20format%29&hydrometeors=false&start=latest'

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
    const maxElevation = 2000
    const split = data.split('\n')
    let table = []
    let newSet = true
    let surface
    let group = []
    let nextLayer = 0
    let previousLayer = 0
    const header = ['elev', 'mph', 'head', 'temp']
    for (let i = 0; i < split.length; i++){
        let line = split[i].trim().split(/ +/)
        let first = line[0]
        if (first === '' || isNaN(first)){
            if (!newSet){
                newSet = true
                table.push(group)
                group = []
            }
        } else {
            if (first <= 3){
                continue
            }
            if (first === '9'){
                newSet = false
                nextLayer = 0
                previousLayer = 0
                surface = line[2]
                group.push(header)
            }
            let elevation = line[2] - surface
            if (previousLayer <= maxElevation && elevation >= nextLayer) {
                group.push(await createRow(line, elevation))
                previousLayer = elevation
                nextLayer = elevation + layerSize
            }
        }
    }
    return table
}

async function createRow(line, elevation){
    let row = []
    row.push(elevation)
    row.push(Math.round(line[6] * 1.151))
    row.push(Number(line[5]))
    row.push(Math.round(((line[3] / 10) * 1.8) + 32))
    return row
}

doRequest().then()
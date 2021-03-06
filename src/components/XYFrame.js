import React from "react"

import { scaleLinear } from "d3-scale"

import { axisPieces, axisLines } from "./visualizationLayerBehavior/axis"

// components

import Axis from "./Axis"
import DownloadButton from "./DownloadButton"
import Frame from "./Frame"
import {
  svgXYAnnotation,
  basicReactAnnotation,
  svgEncloseAnnotation,
  svgRectEncloseRule,
  svgXAnnotation,
  svgYAnnotation,
  svgBoundsAnnotation,
  svgLineAnnotation,
  svgAreaAnnotation,
  svgHorizontalPointsAnnotation,
  svgVerticalPointsAnnotation,
  htmlTooltipAnnotation
} from "./annotationRules/xyframeRules"

import {
  createPoints,
  createLines,
  createAreas
} from "./visualizationLayerBehavior/general"

import { relativeY } from "./svg/lineDrawing"
import { AnnotationCallout } from "react-annotation"
import {
  calculateMargin,
  drawMarginPath,
  adjustedPositionSize,
  generateFrameTitle
} from "./svg/frameFunctions"
import { xyDownloadMapping } from "./downloadDataMapping"
import {
  projectedX,
  projectedY,
  projectedYTop,
  projectedYMiddle,
  projectedYBottom
} from "./constants/coordinateNames"
import { calculateDataExtent, stringToFn } from "./data/dataFunctions"
import { filterDefs } from "./constants/jsx"
import { xyFrameChangeProps } from "./constants/frame_props"

import PropTypes from "prop-types"

const emptyObjectReturnFunction = () => ({})
const emptyStringReturnFunction = () => ""

let xyframeKey = ""
const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
for (let i = 32; i > 0; --i)
  xyframeKey += chars[Math.floor(Math.random() * chars.length)]

const xyframeSettings = ["margin"]

const projectedCoordinateNames = {
  y: projectedY,
  x: projectedX,
  yMiddle: projectedYMiddle,
  yTop: projectedYTop,
  yBottom: projectedYBottom
}

function mapParentsToPoints(fullDataset) {
  return fullDataset.map(d => {
    if (d.parentLine) {
      return Object.assign({}, d, d.parentLine)
    }
    if (d.parentArea) {
      return Object.assign({}, d, d.parentArea)
    }
    return d
  })
}

class XYFrame extends React.Component {
  static defaultProps = {
    annotations: [],
    foregroundGraphics: undefined,
    size: [500, 500],
    className: "",
    lineType: "line",
    name: "xyframe"
  }

  constructor(props) {
    super(props)

    this.calculateXYFrame = this.calculateXYFrame.bind(this)

    this.renderBody = this.renderBody.bind(this)

    this.state = {
      lineData: null,
      pointData: null,
      areaData: null,
      projectedLines: null,
      projectedPoints: null,
      projectedAreas: null,
      fullDataset: null,
      adjustedPosition: null,
      adjustedSize: null,
      backgroundGraphics: null,
      foregroundGraphics: null,
      axesData: null,
      axes: null,
      renderNumber: 0,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }
    }

    this.xAccessor = null
    this.yAccessor = null
    this.xScale = null
    this.yScale = null

    this.settingsMap = new Map()
    xyframeSettings.forEach(d => {
      this.settingsMap.set(d, new Map())
    })
  }

  componentWillMount() {
    this.calculateXYFrame(this.props)
  }

  componentWillReceiveProps(nextProps) {
    if (
      (this.state.dataVersion &&
        this.state.dataVersion !== nextProps.dataVersion) ||
      !this.state.fullDataset
    ) {
      this.calculateXYFrame(nextProps)
    } else if (
      this.state.size[0] !== nextProps.size[0] ||
      this.state.size[1] !== nextProps.size[1] ||
      (!this.state.dataVersion &&
        xyFrameChangeProps.find(d => {
          return this.props[d] !== nextProps[d]
        }))
    ) {
      this.calculateXYFrame(nextProps)
    }
  }

  screenScales({ xExtent, yExtent, currentProps, adjustedSize }) {
    const xDomain = [0, adjustedSize[0]]
    const yDomain = [adjustedSize[1], 0]

    const xScaleType = currentProps.xScaleType || scaleLinear()
    const yScaleType = currentProps.yScaleType || scaleLinear()

    const xScale = xScaleType
    const yScale = yScaleType

    if (xScaleType.domain) {
      xScaleType.domain(xExtent)
    }
    if (yScaleType.domain) {
      yScaleType.domain(yExtent)
    }
    xScaleType.range(xDomain)
    yScaleType.range(yDomain)

    return { xScale, yScale }
  }

  calculateXYFrame(currentProps) {
    const margin = calculateMargin(currentProps)
    const { adjustedPosition, adjustedSize } = adjustedPositionSize(
      currentProps
    )

    const {
      legend,
      lines,
      lineClass,
      pointStyle,
      pointRenderMode,
      pointClass,
      areaClass,
      canvasLines,
      canvasPoints,
      canvasAreas,
      defined,
      size,
      renderKey,
      lineType,
      customLineMark,
      customPointMark,
      customAreaMark,
      areaStyle,
      areaRenderMode,
      lineStyle,
      lineRenderMode,
      xExtent: baseXExtent,
      yExtent: baseYExtent
    } = currentProps
    let {
      projectedLines,
      projectedPoints,
      projectedAreas,
      fullDataset
    } = currentProps

    const xExtentSettings =
      baseXExtent === undefined || Array.isArray(baseXExtent)
        ? { extent: baseXExtent }
        : baseXExtent
    const yExtentSettings =
      baseYExtent === undefined || Array.isArray(baseYExtent)
        ? { extent: baseYExtent }
        : baseYExtent

    let xExtent = xExtentSettings.extent
    let yExtent = yExtentSettings.extent

    let calculatedXExtent, calculatedYExtent

    const xAccessor = stringToFn(currentProps.xAccessor)
    const yAccessor = stringToFn(currentProps.yAccessor)
    const lineIDAccessor = stringToFn(
      currentProps.lineIDAccessor,
      l => l.semioticLineID
    )

    if (
      !currentProps.dataVersion ||
      (currentProps.dataVersion &&
        currentProps.dataVersion !== this.state.dataVersion)
    ) {
      if (
        !xExtent ||
        !yExtent ||
        !fullDataset ||
        (!projectedLines && !projectedPoints && !projectedAreas)
      ) {
        ;({
          xExtent,
          yExtent,
          projectedLines,
          projectedPoints,
          projectedAreas,
          fullDataset,
          calculatedXExtent,
          calculatedYExtent
        } = calculateDataExtent({ ...currentProps, xExtent, yExtent }))
      }
    } else {
      ;({
        xExtent,
        yExtent,
        projectedLines,
        projectedPoints,
        projectedAreas,
        fullDataset,
        calculatedXExtent,
        calculatedYExtent
      } = this.state)
    }

    const { xScale, yScale } = this.screenScales({
      xExtent,
      yExtent,
      currentProps,
      margin,
      adjustedSize
    })

    const canvasDrawing = []

    const title = generateFrameTitle(currentProps)

    //TODO: blow this shit up
    this.xScale = xScale
    this.yScale = yScale
    this.xAccessor = xAccessor
    this.yAccessor = yAccessor

    let axes = null
    let axesTickLines = null

    const existingBaselines = {}

    if (currentProps.axes) {
      axesTickLines = []
      axes = currentProps.axes.map((d, i) => {
        let axisClassname = d.className || ""
        axisClassname += " axis"
        let axisScale = yScale
        if (existingBaselines[d.orient]) {
          d.baseline = d.baseline || false
        }
        existingBaselines[d.orient] = true
        if (d.orient === "top" || d.orient === "bottom") {
          axisClassname += " x"
          axisScale = xScale
        } else {
          axisClassname += " y"
        }
        axisClassname += ` ${d.orient}`

        let tickValues
        if (d.tickValues && Array.isArray(d.tickValues)) {
          tickValues = d.tickValues
        } else if (d.tickValues) {
          //otherwise assume a function
          tickValues = d.tickValues(fullDataset, currentProps.size, axisScale)
        }
        const axisSize = [adjustedSize[0], adjustedSize[1]]

        const axisParts = axisPieces({
          padding: d.padding,
          tickValues,
          scale: axisScale,
          ticks: d.ticks,
          orient: d.orient,
          size: axisSize,
          margin,
          footer: d.footer,
          tickSize: d.tickSize
        })
        const axisTickLines = (
          <g key={`axes-tick-lines-${i}`} className={`axis ${axisClassname}`}>
            {axisLines({
              axisParts,
              orient: d.orient,
              tickLineGenerator: d.tickLineGenerator
            })}
          </g>
        )
        axesTickLines.push(axisTickLines)
        return (
          <Axis
            label={d.label}
            axisParts={axisParts}
            key={d.key || `axis-${i}`}
            orient={d.orient}
            size={axisSize}
            margin={margin}
            ticks={d.ticks}
            tickSize={d.tickSize}
            tickFormat={d.tickFormat}
            tickValues={tickValues}
            format={d.format}
            scale={axisScale}
            className={axisClassname}
            name={d.name}
            padding={d.padding}
            rotate={d.rotate}
            annotationFunction={d.axisAnnotationFunction}
            glyphFunction={d.glyphFunction}
            baseline={d.baseline}
          />
        )
      })
    }

    let marginGraphic
    if (currentProps.matte) {
      marginGraphic = (
        <path
          fill="white"
          transform={`translate(${-margin.left},${-margin.top})`}
          d={drawMarginPath({
            margin,
            size: size,
            inset: currentProps.matte.inset
          })}
          className="xyframe-matte"
        />
      )
    }

    let legendSettings

    if (legend) {
      legendSettings = legend === true ? {} : legend
      if (lines && !legendSettings.legendGroups) {
        const typeString = lineType && lineType.type ? lineType.type : lineType
        const type =
          ["stackedarea", "stackedpercent", "bumparea"].indexOf(typeString) ===
          -1
            ? "line"
            : "fill"
        const legendGroups = [
          {
            styleFn: currentProps.lineStyle,
            type,
            items: currentProps.lines.map(d =>
              Object.assign({ label: lineIDAccessor(d) }, d)
            )
          }
        ]
        legendSettings.legendGroups = legendGroups
      }
    }
    const areaAnnotations = []
    const areaType = currentProps.areaType
    if (areaType && areaType.label && projectedAreas) {
      projectedAreas.forEach((d, i) => {
        if (d.bounds) {
          const bounds = Array.isArray(d.bounds) ? d.bounds : [d.bounds]
          bounds.forEach(labelBounds => {
            const label =
              typeof areaType.label === "function"
                ? areaType.label(d)
                : areaType.label
            if (label && label !== null) {
              const labelPosition = label.position || "center"
              const labelCenter = [
                xScale(labelBounds[labelPosition][0]),
                yScale(labelBounds[labelPosition][1])
              ] || [xScale(d._xyfCoordinates[0]), yScale(d._xyfCoordinates[1])]
              const labelContent = label.content || (p => p.value || p.id || i)

              areaAnnotations.push({
                x: labelCenter[0],
                y: labelCenter[1],
                dx: label.dx,
                dy: label.dy,
                className: label.className,
                type: label.type || AnnotationCallout,
                note: label.note || { title: labelContent(d) },
                subject: label.subject || { text: labelContent(d) },
                connector: label.connector
              })
            }
          })
        }
      })
    }

    const xyFrameRender = {
      lines: {
        data: projectedLines,
        styleFn: stringToFn(lineStyle, emptyObjectReturnFunction, true),
        classFn: stringToFn(lineClass, emptyStringReturnFunction, true),
        renderMode: stringToFn(lineRenderMode, undefined, true),
        canvasRender: stringToFn(canvasLines, undefined, true),
        customMark: customLineMark,
        type: lineType,
        defined: defined,
        renderKeyFn: stringToFn(renderKey, (d, i) => `line-${i}`, true),
        behavior: createLines
      },
      areas: {
        data: projectedAreas,
        styleFn: stringToFn(areaStyle, emptyObjectReturnFunction, true),
        classFn: stringToFn(areaClass, emptyStringReturnFunction, true),
        renderMode: stringToFn(areaRenderMode, undefined, true),
        canvasRender: stringToFn(canvasAreas, undefined, true),
        customMark: customAreaMark,
        type: areaType,
        renderKeyFn: stringToFn(renderKey, (d, i) => `area-${i}`, true),
        behavior: createAreas
      },
      points: {
        data: projectedPoints,
        styleFn: stringToFn(pointStyle, emptyObjectReturnFunction, true),
        classFn: stringToFn(pointClass, emptyStringReturnFunction, true),
        renderMode: stringToFn(pointRenderMode, undefined, true),
        canvasRender: stringToFn(canvasPoints, undefined, true),
        customMark: stringToFn(customPointMark, undefined, true),
        renderKeyFn: stringToFn(renderKey, (d, i) => `point-${i}`, true),
        behavior: createPoints
      }
    }

    if (
      xExtentSettings.onChange &&
      (this.state.calculatedXExtent || []).join(",") !==
        (calculatedXExtent || []).join(",")
    ) {
      xExtentSettings.onChange(calculatedXExtent)
    }
    if (
      yExtentSettings.onChange &&
      (this.state.calculatedYExtent || []).join(",") !==
        (calculatedYExtent || []).join(",")
    ) {
      yExtentSettings.onChange(calculatedYExtent)
    }

    this.setState({
      lineData: currentProps.lines,
      pointData: currentProps.points,
      areaData: currentProps.areas,
      dataVersion: currentProps.dataVersion,
      projectedLines,
      projectedPoints,
      projectedAreas,
      canvasDrawing,
      fullDataset,
      adjustedPosition,
      adjustedSize,
      backgroundGraphics: currentProps.backgroundGraphics,
      foregroundGraphics: currentProps.foregroundGraphics,
      axesData: currentProps.axes,
      axes,
      axesTickLines,
      title,
      updatedFrame: undefined,
      renderNumber: this.state.renderNumber + 1,
      xScale,
      yScale,
      xExtent,
      yExtent,
      calculatedXExtent,
      calculatedYExtent,
      margin,
      legendSettings,
      matte: marginGraphic,
      areaAnnotations,
      xyFrameRender,
      size
    })
  }

  defaultXYSVGRule({ d, i, annotationLayer, lines, areas, points }) {
    const xAccessor = this.xAccessor
    const yAccessor = this.yAccessor

    const xScale = this.xScale
    const yScale = this.yScale

    let screenCoordinates = []
    const idAccessor = stringToFn(
      this.props.lineIDAccessor,
      l => l.semioticLineID
    )

    const { adjustedPosition, adjustedSize } = adjustedPositionSize(this.props)

    if (!d.coordinates) {
      const xCoord = d[projectedX] || xAccessor(d)
      screenCoordinates = [
        xScale(xCoord),
        relativeY({
          point: d,
          lines,
          projectedYMiddle,
          projectedY,
          projectedX,
          xAccessor,
          yAccessor,
          yScale,
          xScale,
          idAccessor
        })
      ]
      if (
        screenCoordinates[0] === undefined ||
        screenCoordinates[1] === undefined ||
        screenCoordinates[0] === null ||
        screenCoordinates[1] === null
      ) {
        //NO ANNOTATION IF INVALID SCREEN COORDINATES
        return null
      }
    } else if (!d.bounds) {
      screenCoordinates = d.coordinates.map(p => [
        xScale(xAccessor(p)) + adjustedPosition[0],
        relativeY({
          point: p,
          lines,
          projectedYMiddle,
          projectedY,
          projectedX,
          xAccessor,
          yAccessor,
          yScale,
          xScale,
          idAccessor
        }) + adjustedPosition[1]
      ])
    }

    const margin = calculateMargin(this.props)

    //point xy
    //y
    //area

    //TODO: Process your rules first
    if (
      this.props.svgAnnotationRules &&
      this.props.svgAnnotationRules({
        d,
        i,
        screenCoordinates,
        xScale,
        yScale,
        xAccessor,
        yAccessor,
        xyFrameProps: this.props,
        xyFrameState: this.state,
        areas,
        points,
        lines
      }) !== null
    ) {
      return this.props.svgAnnotationRules({
        d,
        i,
        screenCoordinates,
        xScale,
        yScale,
        xAccessor,
        yAccessor,
        xyFrameProps: this.props,
        xyFrameState: this.state,
        areas,
        points,
        lines
      })
    } else if (d.type === "xy" || d.type === "frame-hover") {
      return svgXYAnnotation({ d, screenCoordinates, i })
    } else if (d.type === "react-annotation" || typeof d.type === "function") {
      return basicReactAnnotation({ d, screenCoordinates, i })
    } else if (d.type === "enclose") {
      return svgEncloseAnnotation({ d, screenCoordinates, i })
    } else if (d.type === "enclose-rect") {
      return svgRectEncloseRule({ d, screenCoordinates, i })
    } else if (d.type === "x") {
      return svgXAnnotation({
        d,
        screenCoordinates,
        i,
        annotationLayer,
        adjustedSize,
        margin
      })
    } else if (d.type === "y") {
      return svgYAnnotation({
        d,
        screenCoordinates,
        i,
        annotationLayer,
        adjustedSize,
        adjustedPosition,
        margin
      })
    } else if (d.type === "bounds") {
      return svgBoundsAnnotation({
        screenCoordinates,
        d,
        i,
        adjustedSize,
        adjustedPosition,
        xAccessor,
        yAccessor,
        xScale,
        yScale,
        margin
      })
    } else if (d.type === "line") {
      return svgLineAnnotation({ d, i, screenCoordinates })
    } else if (d.type === "area") {
      return svgAreaAnnotation({
        d,
        i,
        screenCoordinates,
        xScale,
        xAccessor,
        yScale,
        yAccessor,
        annotationLayer
      })
    } else if (d.type === "horizontal-points") {
      return svgHorizontalPointsAnnotation({
        d,
        lines: lines.data,
        points: points.data,
        xScale,
        yScale,
        pointStyle: points.styleFn
      })
    } else if (d.type === "vertical-points") {
      return svgVerticalPointsAnnotation({
        d,
        lines: lines.data,
        points: points.data,
        xScale,
        yScale,
        pointStyle: points.styleFn
      })
    }
    return null
  }

  defaultXYHTMLRule({ d, i, lines, areas, points }) {
    const xAccessor = this.xAccessor
    const yAccessor = this.yAccessor

    const xScale = this.xScale
    const yScale = this.yScale

    let screenCoordinates = []

    const { size } = this.props

    const idAccessor = stringToFn(
      this.props.lineIDAccessor,
      l => l.semioticLineID
    )
    const xCoord = d[projectedX] || xAccessor(d)
    const yCoord = d[projectedY] || yAccessor(d)

    const xString = xCoord && xCoord.toString ? xCoord.toString() : xCoord
    const yString = yCoord && yCoord.toString ? yCoord.toString() : yCoord

    const { adjustedPosition /*, adjustedSize*/ } = adjustedPositionSize(
      this.props
    )
    if (!d.coordinates) {
      screenCoordinates = [
        xScale(xCoord),
        relativeY({
          point: d,
          lines,
          projectedYMiddle,
          projectedY,
          projectedX,
          xAccessor,
          yAccessor,
          yScale,
          xScale,
          idAccessor
        })
      ]
      if (
        screenCoordinates[0] === undefined ||
        screenCoordinates[1] === undefined ||
        screenCoordinates[0] === null ||
        screenCoordinates[1] === null
      ) {
        //NO ANNOTATION IF INVALID SCREEN COORDINATES
        return null
      }
    } else {
      screenCoordinates = d.coordinates.map(p => [
        xScale(xAccessor(p)) + adjustedPosition[0],
        relativeY({
          point: p,
          lines,
          projectedYMiddle,
          projectedY,
          projectedX,
          xAccessor,
          yAccessor,
          yScale,
          xScale,
          idAccessor
        }) + adjustedPosition[1]
      ])
    }

    if (
      this.props.htmlAnnotationRules &&
      this.props.htmlAnnotationRules({
        d,
        i,
        screenCoordinates,
        xScale,
        yScale,
        xAccessor,
        yAccessor,
        xyFrameProps: this.props,
        xyFrameState: this.state,
        areas,
        points,
        lines
      }) !== null
    ) {
      return this.props.htmlAnnotationRules({
        d,
        i,
        screenCoordinates,
        xScale,
        yScale,
        xAccessor,
        yAccessor,
        xyFrameProps: this.props,
        xyFrameState: this.state,
        areas,
        points,
        lines
      })
    }
    if (d.type === "frame-hover") {
      let content = (
        <div className="tooltip-content">
          <p key="html-annotation-content-1">{xString}</p>
          <p key="html-annotation-content-2">{yString}</p>
          {d.percent ? (
            <p key="html-annotation-content-3">
              {parseInt(d.percent * 1000, 10) / 10}%
            </p>
          ) : null}
        </div>
      )

      if (d.type === "frame-hover" && this.props.tooltipContent) {
        content = this.props.tooltipContent(d)
      }
      return htmlTooltipAnnotation({
        content,
        screenCoordinates,
        size,
        i,
        d
      })
    }
    return null
  }

  render() {
    return this.renderBody({})
  }

  renderBody({ afterElements, beforeElements }) {
    const {
      downloadFields,
      xAccessor,
      yAccessor,
      lines,
      points,
      areas,
      name,
      download,
      size,
      className,
      annotationSettings,
      annotations,
      additionalDefs,
      hoverAnnotation,
      interaction,
      customClickBehavior,
      customHoverBehavior,
      customDoubleClickBehavior,
      canvasPostProcess,
      baseMarkProps,
      useSpans
    } = this.props

    const {
      title,
      backgroundGraphics,
      foregroundGraphics,
      adjustedPosition,
      adjustedSize,
      margin,
      matte,
      axes,
      axesTickLines,
      extent,
      xScale,
      yScale,
      dataVersion,
      fullDataset,
      areaAnnotations,
      legendSettings,
      xyFrameRender
    } = this.state

    let downloadButton
    if (download) {
      const downloadData =
        download === "points"
          ? mapParentsToPoints(fullDataset)
          : points || lines || areas
      downloadButton = (
        <DownloadButton
          csvName={`${name}-${new Date().toJSON()}`}
          width={parseInt(size[0], 10)}
          data={xyDownloadMapping({
            data: downloadData,
            xAccessor:
              download === "points" || points
                ? stringToFn(xAccessor)
                : undefined,
            yAccessor:
              download === "points" || points
                ? stringToFn(yAccessor)
                : undefined,
            fields: downloadFields
          })}
        />
      )
    }

    const finalFilterDefs = filterDefs({
      matte: matte,
      key: matte && (this.props.frameKey || xyframeKey),
      additionalDefs: additionalDefs
    })

    // foreground and background graphics should handle either JSX or a function that passes size & margin and returns JSX
    return (
      <Frame
        name="xyframe"
        renderPipeline={xyFrameRender}
        adjustedPosition={adjustedPosition}
        size={size}
        extent={extent}
        projectedCoordinateNames={projectedCoordinateNames}
        xScale={xScale}
        yScale={yScale}
        axes={axes}
        axesTickLines={axesTickLines}
        title={title}
        dataVersion={dataVersion}
        matte={matte}
        className={className}
        adjustedSize={adjustedSize}
        finalFilterDefs={finalFilterDefs}
        frameKey={xyframeKey}
        hoverAnnotation={hoverAnnotation}
        defaultSVGRule={this.defaultXYSVGRule.bind(this)}
        defaultHTMLRule={this.defaultXYHTMLRule.bind(this)}
        annotations={
          areaAnnotations.length > 0
            ? [...annotations, ...areaAnnotations]
            : annotations
        }
        annotationSettings={annotationSettings}
        legendSettings={legendSettings}
        projectedYMiddle={projectedYMiddle}
        interaction={interaction}
        customClickBehavior={customClickBehavior}
        customHoverBehavior={customHoverBehavior}
        customDoubleClickBehavior={customDoubleClickBehavior}
        points={fullDataset}
        margin={margin}
        backgroundGraphics={backgroundGraphics}
        foregroundGraphics={foregroundGraphics}
        beforeElements={beforeElements}
        afterElements={afterElements}
        downloadButton={downloadButton}
        disableContext={this.props.disableContext}
        canvasPostProcess={canvasPostProcess}
        baseMarkProps={baseMarkProps}
        useSpans={useSpans}
      />
    )
  }
}

XYFrame.propTypes = {
  name: PropTypes.string,
  lines: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  points: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  areas: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  margin: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
  dataVersion: PropTypes.string,
  frameKey: PropTypes.string,
  axes: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  matte: PropTypes.oneOfType([PropTypes.bool, PropTypes.object]),
  size: PropTypes.array,
  position: PropTypes.array,
  xScaleType: PropTypes.func,
  yScaleType: PropTypes.func,
  xExtent: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  yExtent: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  invertX: PropTypes.bool,
  invertY: PropTypes.bool,
  xAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  yAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  lineDataAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  areaDataAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  backgroundGraphics: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  foregroundGraphics: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  canvasPostProcess: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  additionalDefs: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  customHoverBehavior: PropTypes.func,
  customClickBehavior: PropTypes.func,
  customDoubleclickBehavior: PropTypes.func,
  lineType: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  showLinePoints: PropTypes.bool,
  defined: PropTypes.func,
  lineStyle: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  pointStyle: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  areaStyle: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  lineClass: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  pointClass: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  areaClass: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  canvasPoints: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
  customPointMark: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  hoverAnnotation: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.array,
    PropTypes.func,
    PropTypes.bool
  ]),
  customLineMark: PropTypes.func,
  customAreaMark: PropTypes.func,
  lineIDAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  svgAnnotationRules: PropTypes.func,
  htmlAnnotationRules: PropTypes.func,
  tooltipContent: PropTypes.func,
  annotations: PropTypes.array,
  interaction: PropTypes.object,
  baseMarkProps: PropTypes.object,
  download: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]), //add a download button for graphs data as csv
  downloadFields: PropTypes.array //additional fields aside from x,y to add to the csv
}

export default XYFrame

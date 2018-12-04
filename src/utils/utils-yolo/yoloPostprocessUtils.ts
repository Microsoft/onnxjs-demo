import ndarray from 'ndarray';
import {Type, NumberDataType} from './yoloPostprocess';

// check the inputs shape before running an OP.
// return true when the inputs pass the check
// return false when the inputs do not fit the requirement
// throw exception when fatal error or not implemented
export function checkInputsShape(inputs: any[], ...expectedDimensions: number[]): boolean {
    if (!inputs || inputs.length !== expectedDimensions.length) {
      return false;
    }
    for (let i = 0; i < inputs.length; i++) {
      if (!inputs[i].dims || inputs[i].dims.length !== expectedDimensions[i]) {
        return false;
      }
    }
    return true;
  }
  
  export class BroadcastUtil {
    /**
     * Calculate the expected shape when broadcasting 2 tensors
     * @param a The shape of tensor A. Should be an array of positive integers
     * @param b The shape of tensor B. Should be an array of positive integers
     * @param isMatMul Whether the operation is MatMul
     * @returns The expected shape of the result, or undefined if N/A
     */
    static calcShape(adims: ReadonlyArray<number>, bdims: ReadonlyArray<number>, isMatMul = false): number[]|undefined {
      const arank = adims.length;
      const brank = bdims.length;
      const crank = Math.max(adims.length, bdims.length);
      const cdims = new Array<number>(crank);
  
      // calculate the last 2 dimension if it is MatMul
      if (isMatMul) {
        if (arank < 2 || brank < 2) {
          return undefined;
        }
        const cShapeMatMul =
            BroadcastUtil.calcMatMulShape([adims[arank - 2], adims[arank - 1]], [bdims[brank - 2], bdims[brank - 1]]);
        if (cShapeMatMul === undefined) {
          return undefined;
        }
        [cdims[crank - 2], cdims[crank - 1]] = cShapeMatMul;
      }
  
      for (let i = isMatMul ? 3 : 1; i <= crank; i++) {
        const aLen = arank - i < 0 ? 1 : adims[arank - i];
        const bLen = brank - i < 0 ? 1 : bdims[brank - i];
  
        if (aLen !== bLen && aLen > 1 && bLen > 1) {
          return undefined;
        }
        cdims[crank - i] = Math.max(aLen, bLen);
      }
  
      return cdims;
    }
  
    /**
     * Calculate the expected shape when matrix multiplication
     * @param a The shape of tensor A. Should be a tuple of 2 positive integers
     * @param b The shape of tensor B. Should be a tuple of 2 positive integers
     * @returns The expected shape of the result, or undefined if N/A
     */
    static calcMatMulShape(a: [number, number], b: [number, number]): [number, number]|undefined {
      return (a[1] !== b[0]) ? undefined : [a[0], b[1]];
    }
  
    /**
     * Given the indices of a broadcasted tensor, calculate the original indices
     * @param indices The given indices of the broadcasted tensor.
     * @param shapeOrigin The origin shape of the tensor before broadcast
     * @param isMatMul Whether the operation is MatMul
     * @returns The calculated indices that maps to the original tensor. If the
     * operation is MatMul, the indices of last 2 dimensions will keep as same as
     * input indices
     */
    static index(indices: number[], shapeOrigin: number[], isMatMul = false): number[] {
      // we assume the parameter indices is valid. ie. it should have the same
      // length as the broadcasted shape, and for each dimension the index should
      // not be out of range.
      const dimOffset = indices.length - shapeOrigin.length;
      const indicesOrigin = indices.slice(dimOffset);
      const dimLen = isMatMul ? indicesOrigin.length - 2 : indicesOrigin.length;
      for (let i = 0; i < dimLen; i++) {
        indicesOrigin[i] = indices[dimOffset + i] % shapeOrigin[i];
      }
      return indicesOrigin;
    }
  
    /**
     * Perform the broadcasting operation on the specific operator
     * @param a The input tensor A
     * @param b The input tensor B
     * @param op The operator lambda function
     * @returns The result tensor, or undefined if input not broadcastable.
     */
    static calc(a: ndarray, b: ndarray, op: (a: number, b: number) => number): ndarray|undefined {
      const shape = BroadcastUtil.calcShape(a.shape, b.shape);
      if (shape) {
        const size = ShapeUtil.size(shape);
        const c = ndarray(
            new (
                a.data.constructor as Int8ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor |
                Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor | Float32ArrayConstructor |
                Float64ArrayConstructor | Uint8ClampedArrayConstructor)(size),
            shape);
  
        const indices = new Array<number>(shape.length);
        for (let i = 0; i < size; i++) {
          // traversal indices
          let rest = i;
          for (let j = shape.length - 1; j >= 0; j--) {
            indices[j] = rest % shape[j];
            rest = Math.floor(rest / shape[j]);
          }
  
          // map index
          const indicesA = BroadcastUtil.index(indices, a.shape);
          const indicesB = BroadcastUtil.index(indices, b.shape);
  
          // assign value
          c.set(...indices.concat(op(a.get(...indicesA), b.get(...indicesB))));
        }
  
        return c;
      }
  
      return undefined;
    }
  
    /**
     * Determine if a shape is unidirectional broadcastable to another shape
     * @param shape The input shape
     * @param finalShape The desired shape after broadcasting
     */
    static isValidBroadcast(shape: ReadonlyArray<number>, finalShape: ReadonlyArray<number>): boolean {
      // align shape to the right
      const inputRank = shape.length;
      const finalRank = finalShape.length;
      if (inputRank > finalRank) {
        return false;
      }
      for (let i = 1; i <= inputRank; i++) {
        if (shape[inputRank - i] !== 1 && shape[inputRank - i] !== finalShape[finalRank - i]) {
          return false;
        }
      }
      return true;
    }
  }
  
  // copy array helper
  // mimics memcpy as much as possible
  export function arrayCopyHelper(
      target: NumberDataType, source: NumberDataType, targetIndex: number, sourceIndex: number,
      blockSize: number) {
    if (sourceIndex < 0 || sourceIndex >= source.length) {
      throw new Error(`sourceIndex out of bounds`);
    }
    if (targetIndex < 0 || targetIndex >= target.length) {
      throw new Error(`targetIndex out of bounds`);
    }
    if (sourceIndex + blockSize > source.length) {
      throw new Error(`source indices to be copied are outside bounds`);
    }
    if (targetIndex + blockSize > target.length) {
      throw new Error(`target array is too small to hold result`);
    }
  
    for (let offset = 0; offset < blockSize; offset++) {
      target[targetIndex + offset] = source[sourceIndex + offset];
    }
  }
  
  export class GemmUtil {
    // will make sure input shapes are compatible for this op
    // and return back the shape of the output in the form of a tuple
    // will throw exception if the input shapes are not compatible
    static getShapeOfGemmResult(
        leftShape: ReadonlyArray<number>, transLeft: boolean, rightShape: ReadonlyArray<number>, transRight: boolean,
        biasShape: ReadonlyArray<number>): number[] {
      if (leftShape.length !== 2 || rightShape.length !== 2) {
        throw new Error(`shape need to be of size 2`);
      }
  
      let M: number;
      let K: number;
      let N: number;
  
      if (transLeft) {
        M = leftShape[1];
        K = leftShape[0];
      } else {
        M = leftShape[0];
        K = leftShape[1];
      }
  
      let kDim = -1;
  
      if (transRight) {
        N = rightShape[0];
        kDim = 1;
      } else {
        N = rightShape[1];
        kDim = 0;
      }
  
      if (rightShape[kDim] !== K) {
        throw new Error(`dimension mismatch`);
      }
  
      if (M <= 0 || N <= 0 || K <= 0) {
        throw new Error(`invalid shape specified`);
      }
  
      if (!BroadcastUtil.isValidBroadcast(biasShape, [M, N])) {
        throw new Error(`gemm: invalid bias shape for broadcast`);
      }
  
      return [M, N];
    }
  }
  
  export class NdarrayUtil {
    /**
     * Get the constructor of the data type in the given ndarray
     */
    static ctor<T>(x: ndarray<T>) {
      return x.data.constructor as /* ArrayConstructor | Int8ArrayConstructor
          | Int16ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor
          | Uint16ArrayConstructor | Uint32ArrayConstructor |
          Float32ArrayConstructor | Float64ArrayConstructor |
          Uint8ClampedArrayConstructor*/
      {
        new (arrayLength: number): ndarray.Data<T>;
      };
    }
  
    /**
     * Create a shallow copy of the given ndarray
     */
    static copy<T extends ndarray<U>, U>(x: T): T {
      return ndarray(x.data, x.shape, x.stride, x.offset) as T;
    }
  
    /**
     * Create a new ndarray, using the same underlying data type as the given
     * ndarray
     * @param protoType the ndarray to take as a prototype for data type
     * @param dims the dimensions of the new ndarray
     */
    static create<T extends ndarray<U>, U>(protoType: T, dims: number[]): T {
      const buf = new (NdarrayUtil.ctor(protoType))(ShapeUtil.size(dims));
      return ndarray(buf, dims) as T;
    }
  }
  
  export class TypeUtil {
    static validateSameTypes(typesArray: Type[]) {
      if (typesArray.length < 2) {
        throw new Error('must contain atleast 2 types to compare equality');
      }
      const baseType = typesArray[0];
      for (let i = 0; i < typesArray.length; ++i) {
        if (typesArray[i] !== baseType) {
          throw new Error('input types are ');
        }
      }
    }
  }
  
  export class ShapeUtil {
    static validateEqualDims(dimsArray: Array<ReadonlyArray<number>>) {
      if (dimsArray.length < 2) {
        throw new Error('must contain atleast 2 shapes to compare equality');
      }
      const baseDims = dimsArray[0];
      const baseRank = baseDims.length;
      for (let i = 1; i < dimsArray.length; ++i) {
        const dims = dimsArray[i];
        if (dims.length !== baseRank) {
          throw new Error('rank is not the same for given inpu shapes');
        }
        for (let j = 0; j < baseRank; ++j) {
          if (baseDims[j] !== dims[j]) {
            throw new Error('input shapes are not the same');
          }
        }
      }
    }
  
    static validateDims(dims: ReadonlyArray<number>) {
      if (dims.length < 0 || dims.length > 6) {
        throw new TypeError(`Only rank 0 to 6 is supported for tensor shape.`);
      }
  
      if (dims.length === 0) {
        throw new RangeError('Scaler tensor is not implemented yet');
      }
  
      for (const n of dims) {
        if (!Number.isInteger(n)) {
          throw new TypeError(`Invalid shape: ${n} is not an integer`);
        }
        if (n <= 0 || n > 2147483647) {
          throw new TypeError(`Invalid shape: length ${n} is not allowed`);
        }
      }
    }
  
    static size(dims: ReadonlyArray<number>): number {
      return ShapeUtil.getSizeFromDimensionRange(dims, 0, dims.length);
    }
  
    static sizeFromDimension(dims: ReadonlyArray<number>, axis: number): number {
      if (axis > dims.length) {
        throw new Error(`invalid dimension of ${axis} for sizeFromDimension as Tensor has ${dims.length} dimensions.`);
      }
  
      return ShapeUtil.getSizeFromDimensionRange(dims, axis, dims.length);
    }
  
    static sizeToDimension(dims: ReadonlyArray<number>, axis: number): number {
      if (axis > dims.length) {
        throw new Error(`invalid dimension of ${axis} for sizeToDimension as Tensor has ${dims.length} dimensions.`);
      }
  
      return ShapeUtil.getSizeFromDimensionRange(dims, 0, axis);
    }
  
    static getSizeFromDimensionRange(dims: ReadonlyArray<number>, start: number, end: number): number {
      let size = 1;
      for (let i = start; i < end; i++) {
        // safety check as this method is called by multiple other methods requiring size.
        // size cannot be 0 or negative.
        if (dims[i] <= 0) {
          throw new Error(
              // tslint:disable-next-line:max-line-length
              `cannot get valid size from specified dimension range. Most likely the range contains 0 or negative values in them.`);
        }
        size *= dims[i];
      }
      return size;
    }
  
    // Computes the offset up until the start index for the specified axis
    /**
     * @param index Given index to compute offset for in the flattened
     * @param stride The strides of the tensor corresponding to the index
     * @param axis The 1-indexed axis upto which the offset is to be computed for. If undefined, axis == rank of the
     * index.
     */
  
    static computeOffset(index: number[], stride: number[], axis?: number) {
      if (axis === undefined) {
        axis = index.length;
      }
      let offset = 0;
      for (let i = 0; i < axis; ++i) {
        offset += (index[i] * stride[i]);
      }
      return offset;
    }
    static computeStrides(shape: ReadonlyArray<number>): number[] {
      const rank = shape.length;
      if (rank < 2) {
        return [1];
      }
  
      const strides = new Array(rank);
      strides[rank - 1] = 1;
      strides[rank - 2] = shape[rank - 1];
      for (let i = rank - 3; i >= 0; --i) {
        strides[i] = strides[i + 1] * shape[i + 1];
      }
      return strides;
    }
    static transpose(dims: number[]): number[] {
      return dims.reverse();
    }
    static indicesToOffset(indices: number[], strides: number[]): number {
      const rank = strides.length;
      if (rank === 0) {
        return 0;
      }
      let index = indices[indices.length - 1];
      for (let i = 0; i < indices.length - 1; ++i) {
        index += strides[i] * indices[i];
      }
      return index;
    }
  
    static offsetToIndices(offset: number, strides: number[]): number[] {
      const rank = strides.length;
      if (rank === 0) {
        return [];
      } else if (rank === 1) {
        return [offset];
      }
      const indices: number[] = new Array(strides.length);
      for (let i = 0; i < indices.length - 1; ++i) {
        indices[i] = Math.floor(offset / strides[i]);
        offset -= indices[i] * strides[i];
      }
      indices[indices.length - 1] = offset;
      return indices;
    }
    static getActualAxisFromNegativeValue(axis: number, tensorRank: number): number {
      if (axis < -tensorRank && axis > (tensorRank - 1)) {
        throw new Error('unsupported axis for this operation.');
      }
      return axis < 0 ? axis + tensorRank : axis;
    }
  
    // Increment an index into a tensor (in lexicographic
    // ordering), wrapping around the specified upper_bound.
    /**
     * Increment an index into a tensor (in lexicographic ordering), wrapping around the specified upper_bound.
     * @param index Given index to increment
     * @param dims The dimensions of the tensor for which the given index corresponds to
     * @param axisToIncrementOn The 1-indexed axis to increment on. If undefined, axisToIncrementOn == rank
     */
    static incrementIndex(index: number[], dims: number[], axisToIncrementOn?: number) {
      if (axisToIncrementOn === undefined) {
        axisToIncrementOn = dims.length;
      }
  
      for (let k = axisToIncrementOn - 1; k >= 0; --k) {
        index[k]++;
        if (index[k] < dims[k]) {
          break;
        }
        index[k] = 0;
      }
    }

  /**
   * Produces a new dimensions array based on the values in the 'originalDimensions' and 'shape' array
   * Used in Reshape
   * @param originalDims Original Shape array
   * @param shapeHints array containing values to compute the new dimensions
   * For example:
   * originalDims = [2,2] and shapeHints = [0,-1] will return [2,2]
   * originalDims = [2,2] and shapeHints = [4] will return [4]
   * originalDims = [2,2] and shapeHints = [5] will throw an exception
   * https://github.com/onnx/onnx/blob/master/docs/Operators.md#Reshape
   */

  static calculateReshapedDims(originalDims: ReadonlyArray<number>, shapeHints: ReadonlyArray<number>): number[] {
    const nDims = shapeHints.length;
    const reshapedDims = new Array<number>(nDims);
    let unknownDimension = -1;
    let size = 1;

    for (let i = 0; i < nDims; i++) {
      if (shapeHints[i] < -1) {
        throw new Error('a dimension cannot be less than -1');
      }
      if (shapeHints[i] === -1) {
        if (unknownDimension !== -1) {
          throw new Error('at most one dimension can be -1');
        }
        unknownDimension = i;
      } else {
        if (shapeHints[i] === 0) {
          if (i >= originalDims.length) {
            throw new Error('the dimension with value zero exceeds the dimension size of the input tensor');
          }
          reshapedDims[i] = originalDims[i];
        } else {
          reshapedDims[i] = shapeHints[i];
        }
        size *= reshapedDims[i];
      }
    }

    if (unknownDimension !== -1) {
      const originalTensorFlattenedSize = ShapeUtil.size(originalDims);
      if (originalTensorFlattenedSize % size !== 0) {
        throw new Error(`the input tensor cannot be reshaped to the requested shape. Input shape: [${
            originalDims}] Output shape: [${shapeHints}]`);
      }
      reshapedDims[unknownDimension] = originalTensorFlattenedSize / size;
    }
    return reshapedDims;
  }
  
  /**
   * Sorts a given array based on the indices in the Perm array
   * Used in Transpose
   * @param a Array to be sorted such as dims or strides
   * @param perm Perm given; if null a will be reversed
   */
  static sortBasedOnPerm(a: ReadonlyArray<number>, perm?: number[]): number[] {
      if (perm) {
        return perm.map((v) => a[v]);
      } else {
        return a.slice().reverse();
      }
  }
  
  /**
   * Pads a given shape according to the padding values
   * @param dims shape of the Tensor to be padded
   * @param pad pad values
   */
  static padShape(dims: ReadonlyArray<number>, pad: number[]): number[] {
    const rank = dims.length;
    return dims.map((v, i) => v + pad[i] + pad[i + rank]);
  }
  
  /**
   * Determines if the two shapes are identical
   * @param shape1
   * @param shape2
   */
  static areEqual(shape1: ReadonlyArray<number>, shape2: ReadonlyArray<number>): boolean {
    if (shape1.length !== shape2.length) {
      return false;
    }
    return shape1.every((v, i) => v === shape2[i]);
  }

  /**
   * Splits a given `dims` into 2 mutually exclusive `dims`
   * @param dims ReadonlyArray<number>
   * @param pick number - picks the dim along this axis and composes a new `dims`. 
   * The remnants make up another `dims` 
   */
  static splitDimsIntoTwo(dims: ReadonlyArray<number>, pick: number): [number[], number[]] {
    const picked: number[] = [];
    const remnants: number[] = [];
    
    for(let i = 0; i < dims.length; ++i) {
      if(i === pick) {
        picked.push(dims[i]);
      } else {
        remnants.push(dims[i]);
      }
    }

    return [picked, remnants];

  }
 }
  
  // bunch of helper methods that do a variety of math operations
  export class MathUtil {
    // y = (x*x) + y
    static sqr(
        target: NumberDataType, source: NumberDataType, targetIndex: number, sourceIndex: number,
        blockSize: number) {
      if (sourceIndex < 0 || sourceIndex >= source.length) {
        throw new Error(`sourceIndex out of bounds`);
      }
      if (targetIndex < 0 || targetIndex >= target.length) {
        throw new Error(`targetIndex out of bounds`);
      }
      if (sourceIndex + blockSize > source.length) {
        throw new Error(`source indices to be copied are outside bounds`);
      }
      if (targetIndex + blockSize > target.length) {
        throw new Error(`target array is too small to hold result`);
      }
  
      for (let offset = 0; offset < blockSize; offset++) {
        target[targetIndex + offset] += Math.pow(source[sourceIndex + offset], 2);
      }
    }
  
    // y = ax + y
    static axpy(
        target: NumberDataType, source: NumberDataType, targetIndex: number, sourceIndex: number,
        blockSize: number, alpha: number) {
      if (sourceIndex < 0 || sourceIndex >= source.length) {
        throw new Error(`sourceIndex out of bounds`);
      }
      if (targetIndex < 0 || targetIndex >= target.length) {
        throw new Error(`targetIndex out of bounds`);
      }
      if (sourceIndex + blockSize > source.length) {
        throw new Error(`source indices to be copied are outside bounds`);
      }
      if (targetIndex + blockSize > target.length) {
        throw new Error(`target array is too small to hold result`);
      }
  
      for (let offset = 0; offset < blockSize; offset++) {
        target[targetIndex + offset] += (alpha * source[sourceIndex + offset]);
      }
    }
  
    // y = pow(x, b)
    static powx(
        target: NumberDataType, source: NumberDataType, targetIndex: number, sourceIndex: number,
        blockSize: number, b: number) {
      if (sourceIndex < 0 || sourceIndex >= source.length) {
        throw new Error(`sourceIndex out of bounds`);
      }
      if (targetIndex < 0 || targetIndex >= target.length) {
        throw new Error(`targetIndex out of bounds`);
      }
      if (sourceIndex + blockSize > source.length) {
        throw new Error(`source indices to be copied are outside bounds`);
      }
      if (targetIndex + blockSize > target.length) {
        throw new Error(`target array is too small to hold result`);
      }
  
      for (let offset = 0; offset < blockSize; offset++) {
        target[targetIndex + offset] = Math.pow(source[sourceIndex + offset], b);
      }
    }
  
    // y = x * y
    static mul(
        target: NumberDataType, source: NumberDataType, targetIndex: number, sourceIndex: number,
        blockSize: number) {
      if (sourceIndex < 0 || sourceIndex >= source.length) {
        throw new Error(`sourceIndex out of bounds`);
      }
      if (targetIndex < 0 || targetIndex >= target.length) {
        throw new Error(`targetIndex out of bounds`);
      }
      if (sourceIndex + blockSize > source.length) {
        throw new Error(`source indices to be copied are outside bounds`);
      }
      if (targetIndex + blockSize > target.length) {
        throw new Error(`target array is too small to hold result`);
      }
  
      for (let offset = 0; offset < blockSize; offset++) {
        target[targetIndex + offset] = (source[sourceIndex + offset] * target[targetIndex + offset]);
      }
    }
  }
  
  export class SplitUtil {
    /**
     * Calculates new Shapes from existing one and the splits given along the axis provides
     * @param dims Shape of the Tensor to be splitted into two or more Shapes
     * @param axis The dimension along which the Tensor will be split
     * @param splits Offsets for the start of each split
     */
    static splitShape(dims: ReadonlyArray<number>, axis: number, split: number[], numOutputs?: number):
        [number[][], number[]] {
      if (split.length === 0) {
        if (!numOutputs) {
          throw new Error(`need to know number of outputs when the 'split' attribute is not specified`);
        }
        SplitUtil.determineSplit(dims[axis], numOutputs, split);
      }
  
      const shapes: number[][] = [];
      const offsets = [0];
      for (let i = 0; i < split.length; ++i) {
        if (i !== 0) {
          offsets.push(offsets[i - 1] + split[i - 1]);
        }
        const shape = dims.slice();
        shape[axis] = split[i];
        shapes.push(shape);
      }
      return [shapes, offsets];
    }
  
    static determineSplit(numElementsAlongAxis: number, numOutputs: number, split: number[]) {
      // If 'split' is not specified by the user, we need to partition the number of elements equally among the outputs
      if (numElementsAlongAxis % numOutputs !== 0) {
        throw new Error(`cannot split tensor to equal sized parts`);
      }
      for (let i = 0; i < numOutputs; ++i) {
        split.push(numElementsAlongAxis / numOutputs);
      }
    }
  }
  
  export class PoolConvUtil {
    /**
     * Adjust the kernel, strides, pads to correct rank. Set to default value if not present
     * @param isGlobalOperator If true, perform global pooling.
     * @param inputDims The input tensor dimension.
     * @param kernelShape The size of the kernel along each axis.
     * @param strides Stride along each axis.
     * @param pads Padding for the beginning and ending along each axis.
     */
    static adjustPoolAttributes(
        isGlobalOperator: boolean, inputDims: ReadonlyArray<number>, kernelShape: number[], strides: number[],
        pads: number[]) {
      if (!isGlobalOperator && kernelShape.length !== inputDims.length - 2) {
        throw new Error(`length of specified kernel shapes should be 2 less than length of input dimensions`);
      }
  
      if (isGlobalOperator) {
        // adjust kernel shape to cover the input dims
        for (let dim = 0; dim < inputDims.length - 2; dim++) {
          if (dim >= kernelShape.length) {
            kernelShape.push(inputDims[dim + 2]);
          } else {
            kernelShape[dim] = inputDims[dim + 2];
          }
        }
      }
  
      // adjust strides length to match kernel shape length
      for (let dim = 0; dim < kernelShape.length; dim++) {
        if (dim < strides.length) {
          if (strides[dim] < 0) {
            throw new Error(`strides should be greater than or equal to 1`);
          }
        } else {
          strides.push(1);
        }
      }
  
      // adjust pads length to match 2 * kernel shape length
      for (let dim = 0; dim < kernelShape.length * 2; dim++) {
        if (dim < pads.length) {
          if (pads[dim] < 0) {
            throw new Error(`pad should be greater than or equal to 1`);
          }
        } else {
          pads.push(0);
        }
      }
  
      // sanity checks for values in kernel shapes and pads
      for (let dim = 0; dim < kernelShape.length; dim++) {
        if (kernelShape[dim] <= 0) {
          throw new Error(`kernel shapes need to be greater than 0`);
        }
  
        if (pads[dim] >= kernelShape[dim] || pads[dim + kernelShape.length] >= kernelShape[dim]) {
          throw new Error(`pads should be smaller than kernel`);
        }
      }
    }
  
    // adjust pad values based on 'autoPad' attribute
    static adjustPadsBasedOnAutoPad(
        inputDims: ReadonlyArray<number>, strides: number[], kernelShape: number[], pads: number[], autoPad?: string) {
      if (!autoPad) {
        return;
      }
  
      if (pads.length !== 2 * (inputDims.length - 2)) {
        throw new Error('length of pads should be twice the length of data dimensions');
      }
  
      if (strides.length !== (inputDims.length - 2)) {
        throw new Error('length of strides should be the length of data dimensions');
      }
  
      if (kernelShape.length !== (inputDims.length - 2)) {
        throw new Error('length of kernel shapes should be the length of data dimensions');
      }
  
      for (let dim = 0; dim < inputDims.length - 2; dim++) {
        PoolConvUtil.adjustPadAndReturnShape(
            inputDims[dim + 2], strides[dim], kernelShape[dim], pads, dim, dim + inputDims.length - 2, autoPad);
      }
    }
  
    /**
     * Calculate the output shape for Pool ops based on input attributes. (Should be used only for Pool ops)
     * @param isGlobalOperator If true, perform global pooling.
     * @param inputDims The input tensor dimension. (inputs[0].dims)
     * @param strides Stride along each axis.
     * @param kernelShape The size of the kernel along each axis.
     * @param pads Padding for the beginning and ending along each axis.
     * @param autoPad DEPRECATED attribute supported for legacy models. Specifies how to implicitly 
     * calculate pads in each
     *     dimension. Can take values NOTSET, SAME_UPPER, SAME_LOWER, or VALID.
     */
    static computePoolOutputShape(
        isGlobalOperator: boolean, inputDims: ReadonlyArray<number>, strides: number[], kernelShape: number[],
        pads: number[], autoPad?: string): number[] {
      if (inputDims.length <= 0) {
        throw new Error(`input shape must be of size greater than 0`);
      }
  
      // Add batch size and number of channels of output
      const outputDims = [inputDims[0], inputDims[1]];
  
      PoolConvUtil.computeShapeHelper(isGlobalOperator, inputDims, outputDims, strides, kernelShape, pads, autoPad);
      return outputDims;
    }
  
    /**
     * Calculate the output shape for Conv op based on input attributes. (Should be used only for Conv op)
     * @param inputDims The input tensor dimension. (inputs[0].dims)
     * @param filterDims The filter tensor dimension. (inputs[1].dims)
     * @param strides Stride along each axis.
     * @param kernelShape The size of the kernel along each axis.
     * @param pads Padding for the beginning and ending along each axis.
     * @param autoPad DEPRECATED attribute supported for legacy models. Specifies how to implicitly 
     * calculate pads in each
     *     dimension. Can take values NOTSET, SAME_UPPER, SAME_LOWER, or VALID.
     */
    static computeConvOutputShape(
        inputDims: ReadonlyArray<number>, filterDims: ReadonlyArray<number>, strides: number[], kernelShape: number[],
        pads: number[], autoPad?: string): number[] {
      if (inputDims.length <= 0 || filterDims.length <= 0) {
        throw new Error(`invalid input tensor dims or invalid filter tensor dims`);
      }
  
      // Add batch size and number of channels of output
      const outputDims = [inputDims[0], filterDims[0]];
  
      PoolConvUtil.computeShapeHelper(false, inputDims, outputDims, strides, kernelShape, pads, autoPad);
      return outputDims;
    }
  
    // will compute output shapes for data dimensions ONLY (i.e.) no batch size and channels
    // called by computePoolOutputShape() and computeConvOutputShape()
    // adjust pads based on 'autoPad' attribute prior to shape computation
    private static computeShapeHelper(
        isGlobalOperator: boolean, inputDims: ReadonlyArray<number>, outputDims: number[], strides: number[],
        kernelShape: number[], pads: number[], autoPad?: string) {
      if (isGlobalOperator) {
        for (let dim = 0; dim < inputDims.length - 2; dim++) {
          outputDims.push(1);
        }
      } else {
        for (let dim = 0; dim < inputDims.length - 2; dim++) {
          outputDims.push(PoolConvUtil.adjustPadAndReturnShape(
              inputDims[dim + 2], strides[dim], kernelShape[dim], pads, dim, dim + inputDims.length - 2, autoPad));
        }
      }
    }
  
    // helper for computeShapeHelper() and adjustPadsBasedOnAutoPad()
    // adjusts pad value for given 'autoPad' string and computes output shape along a particular dimension
    private static adjustPadAndReturnShape(
        inSize: number, stride: number, kernel: number, pads: number[], padHeadIndex: number, padTailIndex: number,
        autoPad?: string): number {
      if (autoPad && autoPad !== 'NOTSET') {
        switch (autoPad) {
          case 'VALID':
            pads[padHeadIndex] = 0;
            pads[padTailIndex] = 0;
            return Math.floor(((inSize - kernel) / stride) + 1);
          case 'SAME_LOWER':
            const legacyTargetSize1 = (inSize + stride - 1) / stride;
            const padNeeded1 = (legacyTargetSize1 - 1) * stride + kernel - inSize;
            pads[padHeadIndex] = Math.floor((padNeeded1 + 1) / 2);
            pads[padTailIndex] = padNeeded1 - pads[padHeadIndex];
            return Math.floor(((inSize + padNeeded1 - kernel) / stride) + 1);
          case 'SAME_UPPER':
            const legacyTargetSize = (inSize + stride - 1) / stride;
            const padNeeded = (legacyTargetSize - 1) * stride + kernel - inSize;
            pads[padHeadIndex] = Math.floor(padNeeded / 2);
            pads[padTailIndex] = padNeeded - pads[padHeadIndex];
            return Math.floor(((inSize + padNeeded - kernel) / stride) + 1);
          default:
            throw new Error(`Unsupported AutoPad type`);
        }
      } else {
        return Math.floor(((inSize + pads[padHeadIndex] + pads[padTailIndex] - kernel) / stride) + 1);
      }
    }
  }

export class TypedArrayUtil {
    static createTypedArray(type: string, size: number): Uint8Array|Int32Array|Float32Array {
        switch (type) {
            case 'bool':
            return new Uint8Array(size);
            case 'int32':
            return new Int32Array(size);
            case 'float32':
            return new Float32Array(size);
            default:
            throw new Error('Unsupported type');
        }
    }
}